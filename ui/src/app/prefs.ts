export class Pref<T> {
  public value: T;
  private keyName: string;

  constructor(keyName: string, default_value: T) {
    this.keyName = keyName;
    this.value = default_value;
  }

  init() {
    const storedValue = localStorage[this.keyName];
    if (storedValue != undefined) {
      this.value = JSON.parse(storedValue);
    }
  }

  setValue(value: T) {
    localStorage[this.keyName] = JSON.stringify(value);
    this.value = value;
  }
}
