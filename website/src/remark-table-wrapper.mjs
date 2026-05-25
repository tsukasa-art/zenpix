import { visit } from 'unist-util-visit';

/** Wrap every markdown table in a scroll-enabled div.
 *  overflow-x:auto on the wrapper both enables scrolling
 *  and clips child backgrounds to border-radius (CSS spec §overflow). */
export function remarkTableWrapper() {
  return (tree) => {
    visit(tree, 'table', (node, index, parent) => {
      if (!parent || index == null) return;
      const wrapper = {
        type: 'paragraph',
        data: {
          hName: 'div',
          hProperties: { class: 'table-scroll-wrapper' },
        },
        children: [node],
      };
      parent.children.splice(index, 1, wrapper);
    });
  };
}
