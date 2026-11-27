// The inline sql.js build has the same API as the main entry, with its WebAssembly embedded.
declare module 'sql.js/dist/sql-wasm-inline.js' {
  import initSqlJs from 'sql.js';
  export default initSqlJs;
}

declare module 'sql.js/dist/sql-asm-memory-growth.js' {
  import initSqlJs from 'sql.js';
  export default initSqlJs;
}
