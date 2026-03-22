export class MetadataScanner {
  get label() { return ''; }
  get progressPct() { return 0; }
  get progressLabel() { return `Scanning ${this.label.toLowerCase()}…`; }
  async scan(objName, value) { return []; }
}
