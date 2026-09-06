// Shared with calendar-dialog's Notes editor and comment-composer — kept in one place so the
// two toolbars can't silently drift apart.
export const defaultQuillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
    ['link', 'blockquote', 'code-block', 'clean'],
    ['undo', 'redo']
  ]
};

// A lighter toolbar for the comment composer — a comment is a short message, not a document,
// so the full Notes toolbar (headers, code blocks, undo/redo) is more chrome than it needs.
export const commentQuillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'clean']
  ]
};
