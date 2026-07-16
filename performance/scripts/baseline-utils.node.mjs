import assert from 'node:assert/strict'
import test from 'node:test'
import { median, stableMeasurementEnvelope } from './baseline-utils.mjs'

test('median returns the middle value without changing the input', () => {
  const samples = [9, 1, 5]
  assert.equal(median(samples), 5)
  assert.deepEqual(samples, [9, 1, 5])
})

test('stable measurement envelopes omit volatile fields from the stable payload', () => {
  const envelope = stableMeasurementEnvelope({ nodeVersion: 'v24', commit: 'abc' })
  assert.deepEqual(envelope.measurement, { commit: 'abc', nodeVersion: 'v24' })
  assert.equal(typeof envelope.generatedAt, 'string')
})
