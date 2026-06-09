export function cleanQuestion(raw) {
  // Collapse double backslashes to a single backslash
  const collapse = (str) => (str ? str.replace(/\\\\/g, "\\") : str);

  // Clean prompt
  const prompt = collapse(raw.prompt || "").trim();

  // Clean each option's label and value
  const options = (raw.options || []).map((opt) => ({
    ...opt,
    label: collapse(opt.label),
    value: collapse(opt.value),
  }));

  // Clean explanation – remove leading/trailing backslashes and trim whitespace
  let explanation = raw.explanation || "";
  explanation = explanation.replace(/^\\+/g, ""); // leading backslashes
  explanation = explanation.replace(/\\+$/g, ""); // trailing backslashes
  explanation = explanation.trim();

  return {
    ...raw,
    prompt,
    options,
    explanation,
  };
}
