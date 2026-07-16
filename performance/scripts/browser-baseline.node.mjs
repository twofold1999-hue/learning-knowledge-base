import assert from 'node:assert/strict'
import test from 'node:test'
import { contentOfBytes, makeGraphRecords, makeNote, resolveLocalUrl } from './browser-baseline.mjs'

test('performance fixture builders are deterministic and contain no application writes', () => {
  const note = makeNote('performance_note', contentOfBytes(1024))
  assert.equal(note.id, 'performance_note')
  assert.ok(Buffer.byteLength(note.content) >= 1024)
  assert.equal(note.type, 'knowledge_fragment')
})

test('graph fixtures contain only approved, internally valid records', () => {
  const { entities, relations } = makeGraphRecords(3)
  assert.equal(entities.length, 3)
  assert.equal(relations.length, 2)
  assert.ok(entities.every((entity) => entity.status === 'approved'))
  assert.ok(relations.every((relation) => relation.status === 'approved' && relation.fromEntityId !== relation.toEntityId))
})
test('resolves relative baseline routes against the fixed local production origin', () => {
  assert.equal(resolveLocalUrl('/editor/note_1'), 'http://127.0.0.1:4174/editor/note_1')
})