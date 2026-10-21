import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repository = readFileSync(new URL("../src/data/repository.ts", import.meta.url), "utf8");

test("admin account removal authorizes on the server before deleting any target files", () => {
  const body = repository.match(/adminRemoveAccount: async \(id\) => \{([\s\S]*?)\n  \},\n  adminUpdateMember/)?.[1];
  assert.ok(body, "adminRemoveAccount repository method exists");
  const collect = body.indexOf("collectUserFiles(id)");
  const authorizeAndRemove = body.indexOf('client.rpc("admin_remove_account"');
  const storageDelete = body.indexOf("removeUserFiles(files)");
  assert.ok(collect >= 0 && collect < authorizeAndRemove, "file path collection is read-only and occurs before the RPC");
  assert.ok(authorizeAndRemove >= 0 && authorizeAndRemove < storageDelete, "the authorization-enforcing RPC succeeds before storage deletion");
  assert.ok(body.indexOf("if (error) throw new Error(error.message)") < storageDelete, "RPC rejection prevents file deletion");
});

test("primary-admin self-deletion is rejected before owned files are removed", () => {
  const body = repository.match(/deleteMyAccount: async \(\) => \{([\s\S]*?)\n  \},\n  adminListAccounts/)?.[1];
  assert.ok(body, "deleteMyAccount repository method exists");
  const eligibility = body.indexOf('client.rpc("is_primary_admin")');
  const storageDelete = body.indexOf("removeUserFiles(files, true)");
  const deleteAccount = body.indexOf('client.rpc("delete_my_account")');
  assert.ok(eligibility >= 0 && eligibility < storageDelete, "the primary-admin guard precedes cleanup");
  assert.ok(storageDelete >= 0 && storageDelete < deleteAccount, "authorized self-deletion still cleans owned storage before deleting the auth row");
  assert.match(body, /if \(isPrimaryAdmin !== false\)/);
});
