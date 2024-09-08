#!/usr/bin/env python3

import lark
from lark import Lark
import sys

# Edit at https://www.lark-parser.org/ide/.

# Define the grammar as a raw string.
grammar = r'''
start: struct* bitstruct+

struct: "struct" ID "{"	vardecl* methoddecl* "}"

vardecl: ID ":" vartype

methoddecl: ID "(" vardecl ("," vardecl)* ")"

vartype: simplevartype
	| maptype

simplevartype: ID ("<" INT ">")?

maptype: "map" "<" simplevartype "," simplevartype ">"

bitstruct: "bitstruct" ID ("("arg? ("," arg)*")")? "{" decl* "}" ("action" "{" action* "}")?

arg: ID ":" type

decl: ID ":" type

type: ID ("<" INT ">")?

action: 
    | assignment
    | parse_statement
    | invocation
    | copy

expr: lvalue
    | function_call
    | mul
    | add
    | INT
    | ESCAPED_STRING

function_call: ID "(" expr ("," expr)* ")"

invocation: ID "." ID "(" expr ("," expr)* ")"

mul: expr "*" expr

add: expr "+" expr

lvalue: ID
    | array_access
    | field_access

copy: "copy" lvalue "," expr "," expr "," expr

array_access: lvalue "[" expr "]"

field_access: lvalue "." ID

assignment: lvalue "=" expr

parse_statement: "parse" ID expr

// imports WORD from library
%import common.WORD   

ID: /[a-zA-Z_]([a-zA-Z_0-9]*)/

// Disregard spaces in text
%ignore " "

%import common.NEWLINE
COMMENT: "#" /(.)+/ NEWLINE
%ignore COMMENT
%ignore NEWLINE

%import common.INT
%import common.ESCAPED_STRING
'''

class Type:
    def conv(self, bit_expr):
        return bit_expr

    pass

class Uint(Type):
    def __init__(self, width):
        self.width = int(width)
        self.num = 1
        self.elemwidth = self.width
        self.output = True
    
    def __str__(self):
        return f'uint<{self.width}>'

class Bool(Type):
    def __init__(self):
        self.width = 1
        self.num = 1
        self.elemwidth = self.width
        self.output = True
    
    def __str__(self):
        return 'bool'

    def conv(self, bit_expr):
        return f'{bit_expr} == 1'

class Unparsed(Type):
    def __init__(self, width):
        self.width = int(width)
        self.num = 1
        self.elemwidth = self.width
        self.output = False
    
    def __str__(self):
        return f'unparsed<{self.width}>'

class Byte(Type):
    def __init__(self, width):
        self.width = int(width) * 8
        self.num = int(width)
        self.elemwidth = 8
        self.output = True
    
    def __str__(self):
        return f'byte<{self.num}>'

class Unknown(Type):
    def __init__(self, structure_str):
        self.width = 0
        self.structure_str = structure_str
        self.output = False

    def __str__(self):
        return f'unknown<{self.structure_str}>'

def parse_type(tree):
    match tree:
        case lark.Tree(data=type, children=[lark.Token(type='ID', value='uint'), lark.Token(type='INT', value=width)]):
            return Uint(width)
        case lark.Tree(data=type, children=[lark.Token(type='ID', value='unparsed'), lark.Token(type='INT', value=width)]):
            return Unparsed(width)
        case lark.Tree(data=type, children=[lark.Token(type='ID', value='byte'), lark.Token(type='INT', value=width)]):
            return Byte(width)
        case lark.Tree(data=type, children=[lark.Token(type='ID', value='bool')]):
            return Bool()
        case _:
            return Unknown(str(tree))

def pick_child_token(cc, token_type):
    for c in cc:
        match c:
            case lark.Token(type=t, value=v) if t == token_type:
                return v
    raise KeyError(f'No child of type {token_type} found in {cc}')

def subtrees_of_type(cc, root_type):
    for c in cc:
        match c:
            case lark.Tree(data=t) if t == root_type:
                yield c

def subtree_of_type(cc, root_type):
    for st in subtrees_of_type(cc, root_type):
        return st

def field_extent(pos, width):
    """Returns an array of bit-masks and an array of shifts, for all 4 blocks."""
    # Blocks and bits are numbered from left to right.
    first_block = pos // 16
    first_bit = pos % 16
    last_block = (pos+width-1) // 16
    last_bit = (pos+width-1) % 16
    masks = [0, 0, 0, 0]
    shifts = [0, 0, 0, 0]
    # Iterate over involved blocks from right to left.
    # First, the last block, taken partially.
    masks[last_block] = 65536 - 2**(15-last_bit)
    shifts[last_block] = 15-last_bit
    cur_shl = last_bit + 1
    for b in range(last_block-1, first_block-1, -1):
        masks[b] = 65535
        shifts[b] = -cur_shl
        cur_shl += 16
    # Fix the first mask because this block is also taken partially.
    masks[first_block] &= 2**(16-first_bit)-1
    return (masks, shifts)

def compile_field_parsing(st, pos):
    cc = st.children
    field = pick_child_token(cc, 'ID')
    typ = parse_type(subtree_of_type(cc, 'type'))
    of.write(f'\t// Field {field}: {typ} at +{pos}, width {typ.width}.\n')
    end_pos = pos + typ.width   # Need to store it here because we're going to touch pos.
    if typ.output and field != '_':
        for i in range(typ.num):
            (masks, shifts) = field_extent(pos, typ.elemwidth)
            ts_ok = []
            ts_ops = []
            for b in range(4):
                if masks[b] != 0:
                    ts_ok.append(f'ok[{b}]')
                    if shifts[b] < 0:
                        shift = f' << {-shifts[b]}'
                    elif shifts[b] > 0:
                        shift = f' >> {shifts[b]}'
                    else:
                        shift = ''
                    if masks[b] != 65535:
                        mask = f' & {bin(masks[b])}'
                    else:
                        mask = ''
                    ts_ops.append(f'((block[{b}]{mask}){shift})')
            of.write(f'\tlet {field}{'__' + str(i) if typ.num>1 else ''} = ({" && ".join(ts_ok)}) ?\n')
            of.write(f'\t\t{typ.conv(" | ".join(ts_ops))}\n')
            of.write(f'\t\t: null;\n')
            pos += typ.elemwidth
    return end_pos

def compile_lvalue(st):
    match st:
        case lark.Tree(data='lvalue', children=[lark.Token(type='ID', value=v)]):
            return (v, set([v]))
        case lark.Tree(data='lvalue',  children=[
                lark.Tree(data='field_access', children=[
                    lark.Tree(data='lvalue') as object,
                    lark.Token(type='ID', value=field)])]):
            (c_object, vars_object) = compile_lvalue(object)
            return (f'{c_object}.{field}', vars_object)
        case lark.Tree(data='lvalue', children=[
                lark.Tree(data='array_access', children=[
                    lark.Tree(data='lvalue') as object,
                    lark.Tree(data='expr') as index])]):
            (c_object, vars_object) = compile_lvalue(object)
            (c_index, vars_index) = compile_expr(index)
            return (f'{c_object}[{c_index}]', vars_object | vars_index)
        case _:
            return (f'<<< Unhandled lvalue: {st} >>>', set())

def compile_expr(st):
    """Compiles the `expr` subtree and returns a TypeScript expression and a set of variables."""
    match st:
        case lark.Tree(data='expr', children=[lark.Tree(data='lvalue') as lvalue]):
            return compile_lvalue(lvalue)
        case lark.Tree(data='expr', children=[lark.Token(type='INT', value=v)]):
            return (str(v), set())
        case lark.Tree(data='expr', children=[lark.Token(type='ESCAPED_STRING', value=v)]):
            return (v, set())
        case lark.Tree(data='expr', children=[lark.Tree(data='function_call', children=[
            lark.Token(type='ID', value='lookup'),
            lark.Tree(data='expr') as mapping,
            lark.Tree(data='expr') as key,
            lark.Tree(data='expr') as default])]):
                
            (c_mapping, _) = compile_expr(mapping)
            (c_key, v_key) = compile_expr(key)
            (c_default, v_default) = compile_expr(default)
            return (f'{c_mapping}.get({c_key}) ?? {c_default}', v_key | v_default)
        case _:
            return (f'<<< Unhandled expr: {st} >>>', set())

def output_line(indent, instr):
    tabs = '\t' * indent
    of.write(f'{tabs}{instr}\n')

def output_guarded_block(indent, guard_vars, block):
    if len(guard_vars) > 0:
        vars_test = ' && '.join(f'({v} != null)' for v in sorted(guard_vars))
        output_line(indent, f'if ({vars_test}) {{')
        block_indent = indent+1
        need_closing = True
    else:
        block_indent = indent
        need_closing = False
    for l in block:
        output_line(block_indent, l)
    if need_closing:
        output_line(indent, '}')

def compile_action(st, arguments):
    if len(st.children) == 0:
        return
    elif len(st.children) > 1:
        raise Exception('More than one action!')
    action = st.children[0]
    #of.write(f'\t// {cc}\n')
    match action:
        case lark.Tree(data='assignment', children=[
            lark.Tree(data='lvalue') as lvalue,
            lark.Tree(data='expr') as expr]):
            
            (e, v_expr) = compile_expr(expr)
            (e_lvalue, v_lvalue) = compile_lvalue(lvalue)
            variables = v_expr | v_lvalue
            for a in arguments:
                variables.discard(a)
            output_guarded_block(1, variables, [f'{e_lvalue} = {e};'])
        case lark.Tree(data='copy', children=[
            lark.Tree(data='lvalue') as target,
            lark.Tree(data='expr') as addr,
            lark.Tree(data='expr') as seg_size,
            lark.Tree(data='expr') as value]):
            
            (c_target, _) = compile_lvalue(target)
            (c_addr, v_addr) = compile_expr(addr)
            (c_seg_size, v_seg_size) = compile_expr(seg_size)    # TODO: Add check - seg_size must be an INT litteral.
            (c_value, _) = compile_expr(value)             # TODO: Add check - c_value must be a parse field name.
            for i in range(int(c_seg_size)):
                output_guarded_block(1, v_addr | v_seg_size | set([f'{c_value}__{i}']),
                    [f'{c_target}.setByte({c_addr}*{c_seg_size} + {i}, {c_value}__{i});'])
        case lark.Tree(data='parse_statement', children=[
            lark.Token(),
            lark.Tree(data='expr') as rule]):
            
            (c_rule, v_rule) = compile_expr(rule);
            output_guarded_block(1, v_rule, [f'get_parse_function({c_rule})(block, ok{build_argument_list(arguments, with_types=False)});'])
        case lark.Tree(data='invocation', children=[
            lark.Token(type='ID', value=obj),
            lark.Token(type='ID', value=method),
            *args]):

            (c_args, v_args) = zip(*map(compile_expr, args))

            v = set()
            for v_a in v_args:
                v |= v_a

            output_guarded_block(1, v, [f'{obj}.{method}({", ".join(c_args)})'])

        case _:
            of.write(f'\t// Unhandled action: {action}\n')

rules = {}

def build_argument_list(arguments, with_types):
    if len(arguments) > 0:
        return ', ' + ', '.join(n + (f': {t}' if with_types else '') for n, t in arguments.items())
    return ''

def compile_bitstruct(cc):
    id = pick_child_token(cc, 'ID')
    ts_func = f'parse_{id}'
    rules[id] = ts_func

    # Build map of arguments.
    arguments = {}
    for st in subtrees_of_type(cc, 'arg'):
        match st:
            case lark.Tree(data='arg', children=[
                lark.Token(type='ID', value=arg_name),
                lark.Tree(data='type', children=[
                    lark.Token(type='ID', value=arg_type)
                ])]):
                
                arguments[arg_name] = arg_type
    
    output_line(0, f'export function {ts_func}(block: Uint16Array, ok: boolean[]{build_argument_list(arguments, with_types=True)}) {{')

    pos = 0
    for st in subtrees_of_type(cc, 'decl'):
        pos = compile_field_parsing(st, pos)
    
    if pos != 64:
        raise Exception(f'Inconsistent group length: {pos}.')

    output_line(0, '')
    output_line(1, '// Actions.')
    for st in subtrees_of_type(cc, 'action'):
        compile_action(st, arguments)
    
    output_line(0, '}')
    output_line(0, '')

def compile_vartype(t):
    """Returns a pair: a type-string and a boolean telling if the field can be undefined."""
    match t:
        case lark.Tree(data='simplevartype', children=[lark.Token(type='ID', value='uint'), _]):
            return ('number', True)
        case lark.Tree(data='simplevartype', children=[lark.Token(type='ID', value='bool')]):
            return ('boolean', True)
        case lark.Tree(data='simplevartype', children=[lark.Token(type='ID', value='str'), _]):
            return ('RdsString', False)
        case lark.Tree(data='simplevartype', children=[lark.Token(type='ID', value='tag')]):
            return ('string', True)
        case lark.Tree(data='maptype', children=[lark.Tree() as keytype, lark.Tree() as valuetype]):
            return (f'Map<{compile_vartype(keytype)[0]}, {compile_vartype(valuetype)[0]}>', False)
        case _:
            raise Exception(f'Unhandled vartype: {t}')

def compile_struct(cc):
    struct_name = pick_child_token(cc, 'ID')
    output_line(0, f'export interface {struct_name} {{')
    for st in subtrees_of_type(cc, 'vardecl'):
        match st:
            case lark.Tree(data='vardecl', children=[
                lark.Token(type='ID', value=field_name),
                lark.Tree(data='vartype', children=[type_tree])]):

                (type_str, undef) = compile_vartype(type_tree)
                output_line(1, f'{field_name}{"?" if undef else ""}: {type_str};')
            case v: print(f'WARNING: Unexpected vardecl: {v}')
    for st in subtrees_of_type(cc, 'methoddecl'):
        match st:
            case lark.Tree(data='methoddecl', children=[
                lark.Token(type='ID', value=method_name),
                *args]):

                ar = []
                for a in args:
                    match a:
                        case lark.Tree(data='vardecl', children=[
                            lark.Token(type='ID', value=arg_name),
                            lark.Tree(data='vartype', children=[type_tree])]):

                            (type_str, _) = compile_vartype(type_tree)
                            ar.append(f'{arg_name}: {type_str}')
                output_line(1, f'{method_name}({", ".join(ar)}): void;')
            case v: print(f'WARNING: Unexpected vardecl: {v}')
    output_line(0, '}')
    output_line(0, '')

def compile(t):
    output_line(0, '// Generated file. DO NOT EDIT.')
    output_line(0, '')
    output_line(0, 'import { RdsString } from "./rds_types";')
    output_line(0, '')

    for c in t.children:
        match c:
            case lark.Tree(data='struct', children=cc):
                compile_struct(cc)
            case lark.Tree(data='bitstruct', children=cc):
                compile_bitstruct(cc)
            case lark.Tree(data=d, children=cc):
                print(f'Unhandled {d}')
            case _:
                print('z')
    
    output_line(0, 'export function get_parse_function(rule: string) {')
    output_line(1, 'switch (rule) {')
    for (rule_id, ts_func) in rules.items():
        output_line(2, f'case "{rule_id}": return {ts_func};')
    output_line(1, '}')
    output_line(1, 'throw new RangeError("Invalid rule: " + rule);')
    output_line(0, '}')


l = Lark(grammar)

infile = sys.argv[1] + '.p'
outfile = sys.argv[1] + '.ts'

f = open(infile, encoding="utf8")
lines = f.readlines()
p = l.parse("\n".join(lines))
#print(p)
#print(p.pretty())

of = open(outfile, encoding="utf8", mode="w")

compile(p)
