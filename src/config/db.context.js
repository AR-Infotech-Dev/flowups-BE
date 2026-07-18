import { AsyncLocalStorage } from "node:async_hooks";

const dbStorage = new AsyncLocalStorage();

export const runWithDb = (db, callback) => {
  return dbStorage.run({ db }, callback);
};

export const getActiveDb = () => {
  return dbStorage.getStore()?.db || null;
};