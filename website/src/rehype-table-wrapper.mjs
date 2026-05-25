import { visit } from 'unist-util-visit';
import { h } from 'hastscript';

/** Wrap every HTML table in a single scroll/clip div. */
export function rehypeTableWrapper() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index == null) return;
      const wrapper = h('div.table-scroll-wrapper', [node]);
      parent.children.splice(index, 1, wrapper);
      return index + 1;
    });
  };
}
