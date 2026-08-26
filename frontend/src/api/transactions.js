import { apiGet } from "./client";

export const fetchTransactions = (limit = 100, offset = 0, stationId = null) => {
    const params = new URLSearchParams({ limit, offset });
    if (stationId != null) params.set("station_id", stationId);
    return apiGet(`/transactions?${params}`);
};
