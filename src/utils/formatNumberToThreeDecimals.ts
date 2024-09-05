/** 전력량은 소수점 넷째자리부터 버림처리 후 셋째자리까지 소수점을 고정해서 보여준다*/
export function formatNumberToThreeDecimals(value?: number | string) {
  if (typeof value === "undefined") {
    return;
  }

  const numValue = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(numValue)) {
    return value;
  }

  return (Math.trunc(numValue * 1000) / 1000).toFixed(3);
}
