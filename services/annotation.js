// ─── 批注服务 ──────────────────────────────────────────

const path = require('path');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, DATA_DIR } = require('../utils/persist');

const ANNOTATIONS_FILE = path.join(DATA_DIR, 'annotations.json');

let annotations = loadJSON(ANNOTATIONS_FILE, []);

function saveAnnotations() { saveJSON(ANNOTATIONS_FILE, annotations); }

function getAnnotations(documentId) {
  return annotations.filter(a => a.documentId === documentId);
}

function createAnnotation(documentId, anchor, content, userId) {
  const ann = {
    id: uuid().slice(0, 12),
    documentId,
    userId,
    anchor: anchor || { type: 'text-range', startOffset: 0, endOffset: 0, text: '' },
    content: { text: (content && content.text) || '', attachments: (content && content.attachments) || [] },
    status: 'open',
    replyThread: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  annotations.push(ann);
  saveAnnotations();
  return ann;
}

function addReply(annotationId, userId, text) {
  const ann = annotations.find(a => a.id === annotationId);
  if (!ann) return null;
  const reply = { userId, text: text.trim(), timestamp: Date.now() };
  ann.replyThread.push(reply);
  ann.updatedAt = Date.now();
  saveAnnotations();
  return reply;
}

function updateStatus(annotationId, status) {
  const ann = annotations.find(a => a.id === annotationId);
  if (!ann) return false;
  ann.status = status;
  ann.updatedAt = Date.now();
  saveAnnotations();
  return true;
}

function deleteAnnotation(annotationId) {
  const idx = annotations.findIndex(a => a.id === annotationId);
  if (idx === -1) return false;
  annotations.splice(idx, 1);
  saveAnnotations();
  return true;
}

function getAnnotation(annotationId) {
  return annotations.find(a => a.id === annotationId);
}

module.exports = {
  annotations,
  getAnnotations,
  createAnnotation,
  addReply,
  updateStatus,
  deleteAnnotation,
  getAnnotation,
};
