export function parseYaml(content: string): any {
  const lines = content.split(/\r?\n/);
  const root: any = {};
  const pathStack: { indent: number; key: string; obj: any }[] = [{ indent: -1, key: "", obj: root }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#") || line.trim() === "") continue;

    // Check for list item first
    const listMatch = line.match(/^(\s*)-\s*(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const valStr = listMatch[2].trim().replace(/^['"]|['"]$/g, "");
      let val: any = valStr;
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (!isNaN(Number(val))) val = Number(val);

      while (pathStack.length > 1 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }

      const currentRecord = pathStack[pathStack.length - 1];
      const parentRecord = pathStack[pathStack.length - 2];
      if (parentRecord && currentRecord.key) {
        if (!Array.isArray(parentRecord.obj[currentRecord.key])) {
          parentRecord.obj[currentRecord.key] = [];
          currentRecord.obj = parentRecord.obj[currentRecord.key];
        }
        currentRecord.obj.push(val);
      }
      continue;
    }

    const match = line.match(/^(\s*)([^#:]+):(.*)$/);
    if (match) {
      const indent = match[1].length;
      const key = match[2].trim();
      let valStr = match[3].trim();

      while (pathStack.length > 1 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }
      const parent = pathStack[pathStack.length - 1].obj;

      if (valStr === "") {
        parent[key] = {};
        pathStack.push({ indent, key, obj: parent[key] });
      } else if (valStr.startsWith("[") && valStr.endsWith("]")) {
        const items = valStr.slice(1, -1).split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
        parent[key] = items;
      } else {
        let val: any = valStr.replace(/^['"]|['"]$/g, "");
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (!isNaN(Number(val))) val = Number(val);
        parent[key] = val;
      }
    }
  }
  return root;
}
