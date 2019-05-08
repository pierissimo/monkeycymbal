export default class DateHelper {
  static now() {
    return new Date();
  }

  static nowPlusSecs(secs) {
    return new Date(Date.now() + secs * 1000);
  }
}
