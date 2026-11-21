// fast-csv: a fast drop-in replacement for csv-reader 1.0.0 (make.fun's reference CSV
// reader). It returns exactly csv-reader's answer {columns, rows, errors} for every
// input, but reads plain records in bulk instead of one character at a time.
//
// Two paths, one semantics (csv-reader's written broken-row policy):
//  - Fast path: a record whose line holds no double quote and no stray CR is sliced
//    out whole and split(','). That covers records of plain numbers, dates, codes
//    and words, one line each.
//  - Slow path: any record whose line holds a quote or a stray CR is parsed by an
//    exact port of csv-reader's own loop, except it jumps between delimiters with
//    indexOf and copies whole slices instead of appending one character at a time.
//    This is where quoted fields (commas, quotes, line breaks inside), quote junk,
//    unterminated quotes, stray CRs and blank lines are handled, exactly as the
//    reference handles them: same error codes, same line/row numbers, same order.
//    The slow readers find the next comma or line break first (short scans), then
//    check only that short slice for a CR, so no scan ever runs past the field.
//
// Policy recap (csv-reader 1.0.0): a U+FEFF at the very start is dropped; a record
// ends at LF or CRLF and a line left with no characters is no record; outside quotes
// a CR not followed by LF is dropped (stray_cr); a field opening with a quote runs
// to the next undoubled quote ("" inside is one quote, CRLF/lone CR inside is LF),
// what follows its closing quote up to the next comma or line break is appended as
// it stands (quote_junk, when the field ends), and a quote that never closes is a
// literal character with the text after it read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is literal; fields stay
// strings, never trimmed or converted; columns is the first record when header is
// true, else null; rows are padded with "" (short_row) or cut (long_row) to the
// first record's width; each error is {code, line, row}, line the 1-based line its
// record starts on, row its index in rows (null for the header).

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes
  // (null: the header). The slow-path readers below report errors against these.
  let recordLine = 1;
  let recordRow = null;

  // The next LF at or after pos (n when there is none): the slow readers use it
  // as the line end instead of scanning for it per field. It is set at each
  // record's start and kept current by readQuoted whenever it crosses a line.
  let lineEnd = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break.
  // Returns the field and how it ended; `added` counts the characters kept.
  // The slice up to the next comma or line break holds no LF, so every CR in it
  // is either the CRLF closing the line (only as its last character, when the
  // field ends at a line break) or a stray CR, dropped with an error.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      if (pos > lineEnd) {
        const ni = text.indexOf('\n', pos);
        lineEnd = ni === -1 ? n : ni;
      }
      const ci = text.indexOf(',', pos);
      let end = lineEnd;
      let what = lineEnd === n ? END : LINE_BREAK;
      if (ci !== -1 && ci < end) { end = ci; what = COMMA; }
      const seg = text.slice(pos, end);
      if (seg.indexOf('\r') === -1) {
        value += seg;
        added += seg.length;
        pos = end;
        if (what === COMMA) { pos += 1; return { value, ended: COMMA, added }; }
        if (what === LINE_BREAK) { pos += 1; line += 1; return { value, ended: LINE_BREAK, added }; }
        return { value, ended: END, added };
      }
      // One or more CRs in this short slice; walk them.
      let i = 0;
      for (;;) {
        const r = seg.indexOf('\r', i);
        if (r === -1) {
          value += seg.slice(i);
          added += seg.length - i;
          break;
        }
        if (r === seg.length - 1 && what === LINE_BREAK) {
          // The CRLF closing the line: the CR is the line break, not content.
          value += seg.slice(i, r);
          added += r - i;
          pos = end + 1;
          line += 1;
          return { value, ended: LINE_BREAK, added };
        }
        value += seg.slice(i, r);
        added += r - i;
        pushError('stray_cr');
        i = r + 1;
      }
      pos = end;
      if (what === COMMA) { pos += 1; return { value, ended: COMMA, added }; }
      if (what === LINE_BREAK) { pos += 1; line += 1; return { value, ended: LINE_BREAK, added }; }
      return { value, ended: END, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      if (pos > lineEnd) {
        const ni = text.indexOf('\n', pos);
        lineEnd = ni === -1 ? n : ni;
      }
      const qi = text.indexOf('"', pos);
      let end = lineEnd;
      let what = lineEnd === n ? END : 4; // LF
      if (qi !== -1 && qi < end) { end = qi; what = 3; } // quote
      // A CR as the slice's last character, just before its LF, is that LF's CRLF.
      let segEnd = end;
      if (what === 4 && end > pos && text.charCodeAt(end - 1) === 13) segEnd = end - 1;
      const seg = text.slice(pos, segEnd);
      if (seg.indexOf('\r') === -1) {
        value += seg;
      } else {
        // Each CR inside quotes is one LF, and the line count moves with it.
        let i = 0;
        for (;;) {
          const r = seg.indexOf('\r', i);
          if (r === -1) {
            value += seg.slice(i);
            break;
          }
          value += seg.slice(i, r);
          value += '\n';
          line += 1;
          i = r + 1;
        }
      }
      pos = end;
      if (what === 3) {
        if (text.charCodeAt(pos + 1) === 34) {
          value += '"';
          pos += 2;
          continue;
        }
        pos += 1;
        closed = true;
        break;
      }
      if (what === 4) {
        value += '\n';
        line += 1;
        pos += 1;
        const ni = text.indexOf('\n', pos);
        lineEnd = ni === -1 ? n : ni;
        continue;
      }
      break; // END: no closing quote in the rest of the text
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is
      // read again as unquoted. The re-read starts back on the opening line, so
      // the line end is that line's again.
      pos = open + 1;
      line = openLine;
      const ni = text.indexOf('\n', pos);
      lineEnd = ni === -1 ? n : ni;
      pushError('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma
    // or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushError('quote_junk');
    return junk;
  }

  // Finishes a record's fields: header, padding/cutting and short/long-row errors.
  function finishRecord(fields, quoted) {
    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: this record is one plain line (no quote, no stray CR). The line
    // is sliced first so the quote/CR checks never scan past it.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    lineEnd = end;
    const lineText = text.slice(pos, end);
    if (lineText.indexOf('"') === -1) {
      const ri = lineText.indexOf('\r');
      // A CR is fine only as the CRLF closing this line; any other CR is stray.
      if (ri === -1 || (nl !== -1 && ri === lineText.length - 1)) {
        const plain = ri === -1 ? lineText : lineText.slice(0, -1);
        pos = nl === -1 ? n : nl + 1;
        line += 1;
        if (plain.length !== 0) finishRecord(plain.split(','), false);
        continue;
      }
    }

    // Slow path: the record holds a quote or a stray CR; parse it exactly.
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
