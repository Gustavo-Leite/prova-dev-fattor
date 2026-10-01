const sampleTextByColumn: readonly (readonly [column: number, text: string])[] = [
  [1, "10000001000010000000"],
  [22, "10000000001PCONTROLE1"],
  [59, "0000000005"],
  [72, "DUPLICATA MERCANTIL"],
  [97, "150425000000001500000099"],
  [124, "N"],
  [139, "00000000000000PAGADOR FAKE 1"],
  [248, "SAO PAULO"],
  [263, "01310100"],
  [279, "SP"],
  [401, "35240300000000000199550010000000011234567890"],
];

export const sampleDetailLine: string = sampleTextByColumn.reduce(
  (line, [column, text]) => line.padEnd(column - 1) + text,
  "",
);
