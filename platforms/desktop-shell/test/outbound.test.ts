import assert from "node:assert/strict";
import test from "node:test";

import { emailSubjectFromContext, parseOutboundPrompt } from "../src/outbound.ts";

test("parses a direct email address without leaking instruction words into the recipient", () => {
  assert.deepEqual(
    parseOutboundPrompt("write an email to test@example.com saying hello from SlyOS"),
    { app: "Mail", contact: "test@example.com", context: "hello from SlyOS" }
  );
});

test("strips telling-her phrasing after an email address", () => {
  assert.deepEqual(
    parseOutboundPrompt("write an email for me to joslyn.barragan@gmail.com telling her the draft is ready"),
    { app: "Mail", contact: "joslyn.barragan@gmail.com", context: "the draft is ready" }
  );
});

test("parses named recipients for messages", () => {
  assert.deepEqual(
    parseOutboundPrompt("text Jamie saying I will be there in ten minutes"),
    { app: "Messages", contact: "Jamie", context: "I will be there in ten minutes" }
  );
});

test("builds a concise subject from the requested content", () => {
  assert.equal(emailSubjectFromContext("hello from SlyOS", "test@example.com"), "Hello from SlyOS");
});
