import * as DashboardModel from "./dashboard.model.js";

export const getDashboardOverview = async (user) => {
  return DashboardModel.getDashboardOverview(user);
};
