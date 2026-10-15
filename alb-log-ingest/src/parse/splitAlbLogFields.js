// 末尾フィールドは時期によって増える。引用符内の空白はフィールド境界にしない。
export function splitAlbLogFields(line) {
  const fields = [];
  let index = 0;

  while (index < line.length) {
    if (line[index] === " ") {
      index += 1;
      continue;
    }

    if (line[index] === '"') {
      const quoted = readQuotedField(line, index + 1);
      fields.push(quoted.value);
      index = quoted.nextIndex;
      continue;
    }

    const nextSpace = line.indexOf(" ", index);
    const end = nextSpace === -1 ? line.length : nextSpace;
    fields.push(line.slice(index, end));
    index = end;
  }

  return fields;
}

function readQuotedField(line, startIndex) {
  let value = "";
  let index = startIndex;

  while (index < line.length) {
    const character = line[index];
    if (character === "\\" && index + 1 < line.length) {
      value += line[index + 1];
      index += 2;
      continue;
    }
    if (character === '"') {
      return { value, nextIndex: index + 1 };
    }
    value += character;
    index += 1;
  }

  return { value, nextIndex: index };
}
