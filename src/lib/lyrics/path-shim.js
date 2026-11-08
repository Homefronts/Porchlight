// Browser stand-in for node "path": kuromoji's loader only calls join(dictPath, file).
export const join = (a, b) => a.replace(/\/+$/, "") + "/" + b;
export default { join };
