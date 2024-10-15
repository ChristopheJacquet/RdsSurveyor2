export class Pref<T> {
  public value: T;
  private keyName: string;

  constructor(keyName: string, default_value: T) {
    this.keyName = keyName;
    this.value = default_value;
  }

  init() {
    this.value = JSON.parse(localStorage[this.keyName]) || this.value;
  }

  setValue(value: T) {
    localStorage[this.keyName] = JSON.stringify(value);
    this.value = value;
  }
}
