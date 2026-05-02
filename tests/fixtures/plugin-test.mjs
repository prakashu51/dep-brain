export default {
  name: "test-plugin",
  postScan(result) {
    result.extensions["test-plugin"] = {
      postScan: true,
      scoreAtHook: result.score
    };
  },
  reportHook() {
    return {
      reportHook: true
    };
  }
};
