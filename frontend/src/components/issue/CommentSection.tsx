import { useState } from 'react';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';

interface CommentData {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

const EMOJI_LIST = [
  '😄','😂','👍','👎','❤️','🔥','✅','❌','⚠️','💡','🎯','📝','🔧','🐛','🚀','💬','📎','📋','🖼','⭐','🤖','🔒','📊','⏰',
];

interface CommentSectionProps {
  issueId: string | undefined;
  comments: CommentData[];
  commentSort: 'time' | 'user';
  setCommentSort: (v: 'time' | 'user') => void;
  commentSortDir: 'asc' | 'desc';
  setCommentSortDir: (v: 'asc' | 'desc') => void;
  newComment: string;
  setNewComment: (v: string) => void;
  showAddComment: boolean;
  setShowAddComment: (v: boolean) => void;
  commentCollapsed: boolean;
  setCommentCollapsed: (v: boolean) => void;
  commentAiText: string;
  setCommentAiText: (v: string) => void;
  commentAiLoading: boolean;
  showEmoji: boolean;
  setShowEmoji: (v: boolean) => void;
  showCollapseBtn: boolean;
  sortedComments: CommentData[];
  isClosed: boolean;
  onAddComment: (body: string) => Promise<void>;
  onAiOptimize: () => Promise<void>;
}

export function CommentSection({
  issueId,
  comments,
  commentSort,
  setCommentSort,
  commentSortDir,
  setCommentSortDir,
  newComment,
  setNewComment,
  showAddComment,
  setShowAddComment,
  commentCollapsed,
  setCommentCollapsed,
  commentAiText,
  setCommentAiText,
  commentAiLoading,
  showEmoji,
  setShowEmoji,
  showCollapseBtn,
  sortedComments,
  isClosed,
  onAddComment,
  onAiOptimize,
}: CommentSectionProps) {
  const t = useT();
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; size: string }>
  >([]);
  const [uploading, setUploading] = useState(false);

  // ─── File Upload ───
  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    const results: Array<{ name: string; size: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 10 * 1024 * 1024) {
        alert(`${f.name} exceeds 10MB limit`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('file', f);
        await http.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push({ name: f.name, size: formatSize(f.size) });
      } catch {
        /* skip */
      }
    }
    setUploadedFiles((prev) => [...prev, ...results]);
    setUploading(false);
    e.target.value = '';
  };

  // ─── Revert AI-optimized comment ───
  const handleRevertAi = () => {
    if (commentAiText) {
      setNewComment(commentAiText);
      setCommentAiText('');
    }
  };

  // ─── Submit comment ───
  const handleAddComment = async () => {
    if ((!newComment.trim() && !uploadedFiles.length) || !issueId) return;
    let body = newComment.trim();
    if (uploadedFiles.length > 0) {
      body +=
        '\n\n📎 Attachments:\n' +
        uploadedFiles.map((f) => `${f.name} (${f.size})`).join('\n');
    }
    await onAddComment(body);
    setUploadedFiles([]);
  };

  return (
    <div className="card mb-4">
      <div className="card-hd flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">
          {t.issueDetail.comments} ({comments.length})
        </h3>
        <div className="flex items-center gap-2">
          <select
            className="form-select text-xs"
            style={{
              padding: '3px 8px',
              width: 'auto',
              fontSize: '11px',
            }}
            value={commentSort}
            onChange={(e) =>
              setCommentSort(e.target.value as 'time' | 'user')
            }
          >
            <option value="time">{t.issueDetail.byTime}</option>
            <option value="user">{t.issueDetail.byUser}</option>
          </select>
          <button
            className="btn-ghost btn-xs text-[0.625rem]"
            onClick={() =>
              setCommentSortDir(commentSortDir === 'asc' ? 'desc' : 'asc')
            }
            title={
              commentSortDir === 'asc'
                ? t.issueDetail.ascending
                : t.issueDetail.descending
            }
          >
            {commentSortDir === 'asc'
              ? `↑ ${t.issueDetail.ascending}`
              : `↓ ${t.issueDetail.descending}`}
          </button>
          {showCollapseBtn && (
            <button
              className="btn-ghost btn-xs"
              onClick={() => setCommentCollapsed(!commentCollapsed)}
            >
              {commentCollapsed
                ? t.issueDetail.showAll.replace('{count}', String(comments.length))
                : t.issueDetail.collapse}
            </button>
          )}
        </div>
      </div>
      <div className="card-bd p-0">
        {comments.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-muted">
            {t.issueDetail.noComments}
          </div>
        ) : (
          (commentCollapsed ? sortedComments.slice(0, 3) : sortedComments).map(
            (c) => (
              <div key={c.id} className="hover-row">
                <div className="flex items-center gap-2 mb-2">
                  <div className="av">{(c.authorName || '?').charAt(0)}</div>
                  <span className="text-sm font-semibold text-ink-primary">
                    {c.authorName}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
                  {c.body}
                </p>
              </div>
            ),
          )
        )}

        {/* Add comment — hidden when project closed */}
        {!isClosed && !showAddComment ? (
          <div className="p-3 border-t border-edge">
            <button
              className="btn-secondary btn-xs flex items-center gap-1"
              onClick={() => setShowAddComment(true)}
            >
              <span className="text-base leading-none">+</span>{' '}
              {t.issueDetail.addComment}
            </button>
          </div>
        ) : (
          <div className="p-3 border-t border-edge">
            <textarea
              className="form-input mb-2"
              style={{
                minHeight: '100px',
                padding: '10px 14px',
                fontSize: '13px',
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              placeholder={t.issueDetail.commentPlaceholder}
              value={newComment}
              onChange={(e) => {
                setNewComment(e.target.value);
                setCommentAiText('');
              }}
            />
            {/* Toolbar: emoji + file upload */}
            <div className="flex items-center gap-2 mb-2">
              <div className="relative">
                <button
                  className="btn-ghost btn-xs text-sm"
                  onClick={() => setShowEmoji(!showEmoji)}
                  title="Emoji"
                >
                  {'\u{1F60A}'}
                </button>
                {showEmoji && (
                  <div
                    className="absolute bottom-full left-0 mb-1 card shadow-dialog p-2 z-50"
                    style={{ width: '220px' }}
                  >
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_LIST.map((e) => (
                        <button
                          key={e}
                          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-surface-hover rounded"
                          onClick={() => {
                            setNewComment(newComment + e);
                            setCommentAiText('');
                            setShowEmoji(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <label className="btn-ghost btn-xs text-xs cursor-pointer flex items-center gap-1">
                {uploading ? (
                  <span>{'⏳'} {t.issueDetail.uploading}</span>
                ) : (
                  <>
                    <span>{'\u{1F4CE}'}</span> {t.issueDetail.attachFile}
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  multiple
                  accept="image/*,.log,.txt,.pdf,.zip,.xlsx,.xls,.doc,.docx,.csv"
                />
              </label>
              <span
                className="text-[0.625rem] text-ink-muted"
                style={{ marginLeft: 'auto' }}
              >
                {t.issueDetail.maxSize}
              </span>
            </div>

            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {uploadedFiles.map((f, i) => (
                  <span
                    key={i}
                    className="badge bg-brand-soft text-brand-main text-xs flex items-center gap-1"
                  >
                    {'\u{1F4CE}'} {f.name} ({f.size})
                    <button
                      className="ml-1 text-ink-muted hover:text-danger"
                      onClick={() =>
                        setUploadedFiles((prev) =>
                          prev.filter((_, j) => j !== i),
                        )
                      }
                    >
                      {'×'}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* AI optimized revert */}
            {commentAiText && (
              <div className="mb-2 p-2 bg-brand-soft rounded-card text-xs text-brand-main flex items-center justify-between">
                <span>{'\u{1F916}'} {t.issueDetail.aiOptimized}</span>
                <button className="underline font-semibold" onClick={handleRevertAi}>
                  {t.issueDetail.revertToOriginal}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="btn-brand btn-xs"
                onClick={handleAddComment}
                disabled={!newComment.trim() && uploadedFiles.length === 0}
              >
                {t.issueDetail.submit}
              </button>
              <button
                className="btn-secondary btn-xs"
                onClick={onAiOptimize}
                disabled={!newComment.trim() || commentAiLoading}
              >
                {commentAiLoading ? '\u{1F916} ...' : '\u{1F916} ' + t.issueDetail.aiOptimize}
              </button>
              <button
                className="btn-ghost btn-xs"
                onClick={() => {
                  setShowAddComment(false);
                  setNewComment('');
                  setCommentAiText('');
                  setUploadedFiles([]);
                }}
              >
                {t.issueDetail.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
