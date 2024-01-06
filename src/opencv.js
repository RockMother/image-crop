function loadOpenCV() {
  return new Promise((resolve) => {
    Module = {
      onRuntimeInitialized() {
        resolve();
      },
    };
    cv = require("../lib/opencv.js");
  });
}

export { cv };
