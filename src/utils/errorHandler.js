async function tryCatch(fn) {
  try {
    console.log("inside try cathc")
    const data = await fn();
    return [data, null];
  } catch (err) {
    return [null, err];
  }
}

module.exports = { tryCatch };
