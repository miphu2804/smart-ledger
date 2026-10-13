// Cho Node chạy thẳng mã TS của app (cần --experimental-strip-types): app import không ghi đuôi (`./parseOrder`)
// và import JSON không có `with { type: 'json' }` như Metro cho phép, nên thêm đuôi `.ts` và thuộc tính JSON khi Node cần.
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
