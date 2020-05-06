module.exports.get = (object, selector, defaultValue = undefined) => {
  if (
    typeof object !== "object" ||
    object === null ||
    typeof selector !== "string"
  )
    return defaultValue;

  const value = selector
    .replace(/\[/g, ".[")
    .split(".")
    .reduce((prev, curr) => {
      if (prev === undefined || prev === null) return prev;
      if (curr.startsWith("[")) return prev[curr.slice(1, -1)];
      else return prev[curr];
    }, object);

  return value === undefined ? defaultValue : value;
};
