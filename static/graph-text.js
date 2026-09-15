/* Small, explicit paragraph/list format. Never infer a list from commas. */
(function (root) {
  function parse(value) {
    const blocks = [];
    let current = null;
    for (const line of String(value || '').split(/\r?\n/)) {
      if (!line.trim()) { current = null; continue; }
      const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bullet) {
        if (current?.type !== 'list') { current = { type: 'list', items: [] }; blocks.push(current); }
        current.items.push(bullet[1].trim());
      } else if (current?.type === 'list' && /^\s{2,}\S/.test(line)) {
        current.items[current.items.length - 1] += ' ' + line.trim();
      } else if (current?.type === 'paragraph') {
        current.text += ' ' + line.trim();
      } else {
        current = { type: 'paragraph', text: line.trim() }; blocks.push(current);
      }
    }
    return blocks;
  }
  function plainText(value) {
    return parse(value).map(block => block.type === 'list' ? block.items.join(', ') : block.text).join(' ');
  }
  function append(parent, className, value) {
    const blocks = parse(value);
    const rich = blocks.length > 1 || blocks[0]?.type === 'list';
    const element = document.createElement(rich ? 'div' : 'p');
    element.className = className + (rich ? ' formatted-text' : '');
    if (!rich) element.textContent = blocks[0]?.text || '';
    else for (const block of blocks) {
      if (block.type === 'list') {
        const list = document.createElement('ul');
        for (const text of block.items) {
          const item = document.createElement('li'); item.textContent = text; list.append(item);
        }
        element.append(list);
      } else {
        const paragraph = document.createElement('p'); paragraph.textContent = block.text; element.append(paragraph);
      }
    }
    parent.append(element); return element;
  }
  const api = { parse, plainText, append };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphText = api;
})(typeof window !== 'undefined' ? window : globalThis);
