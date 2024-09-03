import * as changeCase from 'change-case';

export function convertToCamelCase(rows: any[]) {
  return rows?.map((item: any) => {
    const newItem: Record<string, any> = {};

    for (let key in item) {
      if (item.hasOwnProperty(key)) {
        const camelCasedKey = changeCase.camelCase(key);
        newItem[camelCasedKey] = item[key];
      }
    }
    return newItem;
  });
}
