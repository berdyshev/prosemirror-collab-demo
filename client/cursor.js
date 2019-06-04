import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import crel from 'crel';

const cursorsPlugin = new Plugin({
  state: {
    init() {
      return [];
    },
    apply(tr, state) {
      const meta = tr.getMeta(cursorsPlugin);
      if (meta && meta.userCursors) {
        return meta.userCursors;
      }
      return state;
    }
  },
  props: {
    decorations(state) {
      return DecorationSet.create(
        state.doc,
        cursorsPlugin.getState(state).map(({ position, user }, index) =>
          Decoration.widget(
            position,
            crel(
              'span',
              {
                class: 'cursor',
                style: `border-left-color: ${selectColor(index + 1)}`
              },
              crel('span', { class: 'username' }, user.name)
            )
          )
        )
      );
    }
  }
});

function selectColor(colorNum, colors = 20) {
  if (colors < 1) colors = 1; // defaults to one color - avoid divide by zero
  return 'hsl(' + ((colorNum * (360 / colors)) % 360) + ',100%,50%)';
}

export default cursorsPlugin;
