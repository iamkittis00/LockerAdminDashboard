import { apiGet } from "./client";

export const fetchTransactions = (limit = 100, offset = 0) =>
    apiGet(`/transactions?limit=${limit}&offset=${offset}`);
