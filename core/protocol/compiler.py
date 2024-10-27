#!/usr/bin/env python3

from dataclasses import dataclass
import sys
import lark
from lark import Lark

# Edit at https://www.lark-parser.org/ide/.

# Define the grammar as a raw string.
grammar = r'''
start: (import | struct | bitstruct)*

import: "import" ID ID

struct: "struct" ID "{"	vardecl* methoddecl* "}"

vardecl: ID ":" vartype

methoddecl: ID "(" vardecl ("," vardecl)* ")"

vartype: simplevartype
	| maptype

simplevartype: ID ("<" INT ">")?

maptype: "map" "<" simplevartype "," simplevartype ">"

bitstruct: "bitstruct" ID ("("arg? ("," arg)*")")? "{" decl* "}" ("action" "{" action* "}")? ("log" "{" log_element* "}")?

arg: ID ":" type

decl: ID ":" type

type: ID ("<" INT ">")?

action: 
    | assignment
    | parse_statement
    | invocation
    | copy
    | put
    | switch

expr: lvalue
    | function_call
    | mul
    | add
    | INT
    | ESCAPED_STRING

function_call: ID "(" expr ("," expr)* ")"

invocation: lvalue "." ID "(" expr ("," expr)* ")"

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

put : "put" lvalue expr expr

switch : "switch" expr "{" switch_case+ "}"

switch_case : "case" INT ("," INT)* "{" action* "}"

log_element: ESCAPED_STRING

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

@dataclass(frozen=True)
class MapElementGuard:
    """Guard for describing the existence of a Map element."""
    map: str
    element: str
    element_guard: set
    var: str

# Global variable counters
elt_counter = 0
log_counter = 0

class CodeGenerator:
    def __init__(self, of, indent=0, in_block=False):
        self.of = of
        self.indent = indent
        self.in_block = in_block
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_value, traceback):
        if self.in_block:
            self.indent -= 1
            self.line('}')

    def line(self, instr=''):
        if instr == '':
            tabs = ''
        else:
            tabs = '\t' * self.indent
        self.of.write(f'{tabs}{instr}\n')

    def block(self, instr):
        self.line(instr)
        return CodeGenerator(of=self.of, indent=self.indent+1, in_block=True)

    def non_block_indent(self):
        # Special case used under "case" keywords inside "switch": indent
        # without block. Otherwise, similar to block.
        return CodeGenerator(of=self.of, indent=self.indent+1, in_block=False)

    def guarded_block(self, guards):
        guard_vars = set({})

        for guard in guards:
            if isinstance(guard, str):
                guard_vars.add((guard, 'null'))
            match guard:
                case MapElementGuard(map=m, element=e, element_guard=eg, var=v):
                    # TODO (here and below): This is a hackish shortcut that
                    # works only as long as the only struct is Station.
                    # Replace with proper type resolution.
                    self.line(f'let {v}: StationImpl | undefined;')
                    with self.guarded_block(eg) as new_elt_block:
                        new_elt_block.line(f'{v} = {m}.get({e});')
                        with new_elt_block.block(f'if ({v} == undefined) {{') as b:
                            b.line(f'{v} = new StationImpl({e});')
                            b.line(f'{m}.set({e}, {v});')
                    guard_vars.add((v, 'undefined'))

        if len(guard_vars) > 0:
            vars_test = ' && '.join(f'({v} != {bad})' for v, bad in sorted(guard_vars))
            return self.block(f'if ({vars_test}) {{')
        else:
            # Create a block, but without an indent and without a closing symbol.
            return CodeGenerator(of=self.of, indent=self.indent, in_block=False)

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

def compile_field_parsing(codegen, st, pos):
    cc = st.children
    field = pick_child_token(cc, 'ID')
    typ = parse_type(subtree_of_type(cc, 'type'))
    codegen.line(f'// Field {field}: {typ} at +{pos}, width {typ.width}.')
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
            codegen.line(f'let {field}{'__' + str(i) if typ.num>1 else ''} = ({" && ".join(ts_ok)}) ?')
            with codegen.non_block_indent() as cgn:
                cgn.line(f'{typ.conv(" | ".join(ts_ops))}')
                cgn.line(f': null;')
            pos += typ.elemwidth
        # Add summary constant for logging.
        if typ.num > 1:
            codegen.line(
                f'const {field} = [' +
                ', '.join(f'{field}__{i}' for i in range(typ.num)) +
                '];')

    return end_pos

def compile_lvalue(st):
    global elt_counter
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
            elt_var = f'elt{elt_counter}'
            elt_counter += 1
            return (
                elt_var, 
                vars_object | set(
                    {MapElementGuard(
                        map=c_object,
                        element=c_index,
                        element_guard=frozenset(vars_index),
                        var=elt_var)}))
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

def compile_action(codegen, st, arguments):
    if len(st.children) == 0:
        return
    elif len(st.children) > 1:
        raise Exception('More than one action!')
    action = st.children[0]

    match action:
        case lark.Tree(data='assignment', children=[
            lark.Tree(data='lvalue') as lvalue,
            lark.Tree(data='expr') as expr]):
            
            (e, v_expr) = compile_expr(expr)
            (e_lvalue, v_lvalue) = compile_lvalue(lvalue)
            variables = v_expr | v_lvalue
            for a in arguments:
                variables.discard(a)
            with codegen.guarded_block(variables) as cgn:
                cgn.line(f'{e_lvalue} = {e};')
        case lark.Tree(data='copy', children=[
            lark.Tree(data='lvalue') as target,
            lark.Tree(data='expr') as addr,
            lark.Tree(data='expr') as seg_size,
            lark.Tree(data='expr') as value]):
            
            (c_target, v_target) = compile_lvalue(target)
            (c_addr, v_addr) = compile_expr(addr)
            (c_seg_size, v_seg_size) = compile_expr(seg_size)    # TODO: Add check - seg_size must be an INT litteral.
            (c_value, _) = compile_expr(value)             # TODO: Add check - c_value must be a parse field name.
            with codegen.guarded_block(v_target) as gb:
                for i in range(int(c_seg_size)):
                    with gb.guarded_block(v_addr | v_seg_size | set([f'{c_value}__{i}'])) as cgn:
                        cgn.line(f'{c_target}.setByte({c_addr}*{c_seg_size} + {i}, {c_value}__{i});')
        case lark.Tree(data='put', children=[
            lark.Tree(data='lvalue') as target,
            lark.Tree(data='expr') as key,
            lark.Tree(data='expr') as value]):

            (c_target, _) = compile_lvalue(target)    # TODO: Add check - target must be a map.
            (c_key, v_key) = compile_expr(key)
            (c_value, v_value) = compile_expr(value)
            with codegen.guarded_block(v_key | v_value) as cgn:
                cgn.line(f'{c_target}.set({c_key}, {c_value});')

        case lark.Tree(data='parse_statement', children=[
            lark.Token(),
            lark.Tree(data='expr') as rule]):
            
            (c_rule, v_rule) = compile_expr(rule);
            with codegen.guarded_block(v_rule) as cgn:
                cgn.line(f'get_parse_function({c_rule})(block, ok, log{build_argument_list(arguments, with_types=False)});')
        case lark.Tree(data='invocation', children=[
            lark.Tree(data='lvalue') as obj,
            lark.Token(type='ID', value=method),
            *args]):

            (c_args, v_args) = zip(*map(compile_expr, args))

            v = set()
            for v_a in v_args:
                v |= v_a

            (c_obj, v_obj) = compile_lvalue(obj)
            v |= v_obj

            with codegen.guarded_block(v) as cgn:
                cgn.line(f'{c_obj}.{method}({", ".join(c_args)});')

        case lark.Tree(data='switch', children=[
            lark.Tree(data='expr') as expr,
            *cases]):

            (c_expr, v_expr) = compile_expr(expr)

            with codegen.guarded_block(v_expr) as cgn:
                with cgn.block(f'switch ({c_expr}) {{') as cgn2:

                    for c in cases:
                        match c:
                            case lark.Tree(data='switch_case', children=cc):
                                values = []
                                for c in cc:
                                    match c:
                                        case lark.Token(type='INT') as i:
                                            values.append(i)
                                for v in values:
                                    cgn2.line(f'case {v}:')
                                with cgn2.non_block_indent() as cgn3:
                                    for a in subtrees_of_type(cc, 'action'):
                                        compile_action(cgn3, a, arguments)
                                    cgn3.line('break;')
                                    cgn3.line()

        case _:
            codegen.line(f'// Unhandled action: {action}')

def compile_log_element(codegen, st):
    if len(st.children) == 0:
        return
    elif len(st.children) > 1:
        raise Exception('More than one log element!')
    log_element = st.children[0]

    match log_element:
        case lark.Token(type='ESCAPED_STRING', value=s):
            s = s[1:-1].replace('\\"', '"')
            compile_log_string(codegen, s)
        case _:
            raise Exception(f'Unexpected log element: {log_action}')

def format_expr(var, fmt):
    match fmt:
        case 'bool':
            return f"{var} ? '1': '0'"
        case 'u':
            return var
        case '02u':
            return f"{var}.toString().padStart(2, '0')"
        case '02x':
            return f"{var}.toString(16).toUpperCase().padStart(2, '0')"
        case '04x':
            return f"{var}.toString(16).toUpperCase().padStart(4, '0')"
        case 'grouptype':
            return f"({var}>>1).toString() + (({var} & 1) == 0 ? 'A' : 'B')"
        case 'freq':
            return f'formatAf({var})'
        case 'rdstext':
            return f'formatRdsText({var})'
        case 'bytes':
            return f'formatBytes({var})'
        case 'letter':
            return f"{var} ? 'A' : 'B'"
        case 'sign':
            return f"{var} ? '+' : '-'"
        case _:
            raise Exception(f'Unknwon log format string: "{fmt}"')

def compile_log_string(codegen, s):
    global log_counter

    var = f'log{log_counter}'
    log_counter += 1

    # Modes:
    #  0: appending literal characters
    #  1: appending expression
    mode = 0
    part = ''
    variables = set()
    logstr = ''

    for c in s:
        if mode == 0 and c == '{':
            logstr += part
            part = ''
            mode = 1
        elif mode == 1 and c == '}':
            format_parts = part.split(':')
            if len(format_parts) != 2:
                raise Exception(
                    f'Format must be of the form {{variable:formatter}} in log string {s}')
            [var, fmt] = format_parts
            logstr += f'${{{format_expr(var, fmt)}}}'
            variables.add(var)
            part = ''
            mode = 0
        else:
            part += c

    # Handle last current part.
    if mode != 0:
        raise Exception(f'Log string stopped inside expression: {s}')
    logstr += part

    with codegen.guarded_block(variables) as b:
        b.line(f'log.add(`{logstr}`);')

rules = {}

def build_argument_list(arguments, with_types):
    if len(arguments) > 0:
        return ', ' + ', '.join(n + (f': {t}' if with_types else '') for n, t in arguments.items())
    return ''

def compile_bitstruct(codegen, cc):
    i = pick_child_token(cc, 'ID')
    ts_func = f'parse_{i}'
    rules[i] = ts_func

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
    
    with codegen.block(f'export function {ts_func}(block: Uint16Array, ok: boolean[], log: LogMessage{build_argument_list(arguments, with_types=True)}) {{') as cgn:

        pos = 0
        for st in subtrees_of_type(cc, 'decl'):
            pos = compile_field_parsing(cgn, st, pos)
        
        if pos != 64:
            raise Exception(f'Inconsistent group length: {pos}.')

        cgn.line()
        cgn.line('// Actions.')
        for st in subtrees_of_type(cc, 'log_element'):
            compile_log_element(cgn, st)
        for st in subtrees_of_type(cc, 'action'):
            compile_action(cgn, st, arguments)
        
    cgn.line()

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
        # Allow user-defined types to be used as-is in struct fields. In that
        # case they cannot be undefined.
        case lark.Tree(data='simplevartype', children=[lark.Token(type='ID', value=typename)]):
            return (typename, False)
        case _:
            raise Exception(f'Unhandled vartype: {t}')

def compile_struct(codegen, cc):
    struct_name = pick_child_token(cc, 'ID')
    with codegen.block(f'export interface {struct_name} {{') as cgn:
        for st in subtrees_of_type(cc, 'vardecl'):
            match st:
                case lark.Tree(data='vardecl', children=[
                    lark.Token(type='ID', value=field_name),
                    lark.Tree(data='vartype', children=[type_tree])]):

                    (type_str, undef) = compile_vartype(type_tree)
                    cgn.line(f'{field_name}{"?" if undef else ""}: {type_str};')
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
                    cgn.line(f'{method_name}({", ".join(ar)}): void;')
                case v: print(f'WARNING: Unexpected vardecl: {v}')
    codegen.line()

def compile(codegen, t):
    codegen.line('// Generated file. DO NOT EDIT.')
    codegen.line()
    codegen.line('import { RDS_CHARMAP, LogMessage, RdsString, StationImpl, channelToFrequency } from "./rds_types";')
    codegen.line()

    for c in t.children:
        match c:
            case lark.Tree(data='import', children=[
                lark.Token(type='ID', value=module_name),
                lark.Token(type='ID', value=symbol_name)]):
                codegen.line(f'import {{ {symbol_name} }} from "./{module_name}";')
                codegen.line('\n')
            case lark.Tree(data='struct', children=cc):
                compile_struct(codegen, cc)
            case lark.Tree(data='bitstruct', children=cc):
                compile_bitstruct(codegen, cc)
            case lark.Tree(data=d, children=cc):
                print(f'Unhandled {d}')
            case _:
                print('z')

    with codegen.block('export function get_parse_function(rule: string) {') as blk1:
        with blk1.block('switch (rule) {') as blk2:
            for (rule_id, ts_func) in rules.items():
                blk2.line(f'case "{rule_id}": return {ts_func};')
        blk2.line('throw new RangeError("Invalid rule: " + rule);')

    codegen.line()
    with codegen.block('function formatAf(af: number): string {') as blk1:
        blk1.line('const freq = channelToFrequency(af);')
        blk1.line('return freq > 0 ? (freq/10).toString() : "None";')

    codegen.line()
    with codegen.block('function formatRdsText(text: Array<number | null>): string {') as blk1:
        blk1.line('return text.map((c) => c == null ? "." : RDS_CHARMAP[c]).join("");')

    codegen.line()
    with codegen.block('function formatBytes(bytes: Array<number | null>): string {') as blk1:
        blk1.line('return bytes.map((b) => b == null ? ".." : b.toString(16).toUpperCase().padStart(2, "0")).join(" ");')

l = Lark(grammar)

infile = sys.argv[1] + '.p'
outfile = sys.argv[1] + '.ts'

f = open(infile, encoding="utf8")
lines = f.readlines()

preprocessed_lines = []
# Preprocessor.
for li in lines:
    if li.startswith('#include '):
        included_file = li.split(' ')[1].strip()
        incl_f = open(included_file, encoding='utf8')
        incl_lines = incl_f.readlines()
        preprocessed_lines.extend(incl_lines)
    else:
        preprocessed_lines.append(li)

p = l.parse("\n".join(preprocessed_lines))
#print(p)
#print(p.pretty())

of = open(outfile, encoding="utf8", mode="w")
codegen = CodeGenerator(of=of)

compile(codegen, p)
