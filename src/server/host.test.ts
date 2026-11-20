import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAllowedHost, isForeign, mayAct } from './host'

test('answers to loopback names and to the bound host only', () => {
  assert.ok(isAllowedHost('127.0.0.1:4900', '127.0.0.1'))
  assert.ok(isAllowedHost('localhost:4901', '127.0.0.1'))
  assert.ok(isAllowedHost('[::1]:4900', '127.0.0.1'))
  assert.ok(isAllowedHost('zeus.lan:4900', 'zeus.lan'))
  assert.ok(isAllowedHost(undefined, '127.0.0.1'))
  assert.ok(!isAllowedHost('evil.example:4900', '127.0.0.1'))
})

test('tells a page on another origin from the page itself', () => {
  assert.ok(isForeign({ 'sec-fetch-site': 'cross-site' }))
  assert.ok(isForeign({ 'sec-fetch-site': 'same-site' }))
  assert.ok(!isForeign({ 'sec-fetch-site': 'same-origin' }))
  assert.ok(!isForeign({}))
})

test('lets an action through only from the page, as JSON', () => {
  const page = {
    host: 'localhost:4901',
    origin: 'http://localhost:4901',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
  }
  assert.ok(mayAct(page))
  assert.ok(mayAct({ 'content-type': 'application/json; charset=utf-8' }))
  assert.ok(!mayAct({ ...page, 'sec-fetch-site': 'cross-site' }))
  assert.ok(!mayAct({ ...page, origin: 'https://evil.example' }))
  assert.ok(!mayAct({ ...page, 'content-type': 'text/plain' }))
  assert.ok(!mayAct({ ...page, 'content-type': undefined }))
})

test('trusts the dev server origin only when it is named', () => {
  // What the API sees behind the Vite proxy: the page's origin, and its own address as Host.
  const proxied = {
    host: '127.0.0.1:4900',
    origin: 'http://localhost:4901',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
  }
  assert.ok(!mayAct(proxied))
  assert.ok(mayAct(proxied, ['http://localhost:4901']))
  assert.ok(!mayAct({ ...proxied, origin: 'https://evil.example' }, ['http://localhost:4901']))
})
