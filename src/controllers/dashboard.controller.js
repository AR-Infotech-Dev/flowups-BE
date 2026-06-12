import * as DashboardModel from "../models/dashboard.model.js";
import { successResponse, failureResponse } from "../utils/apiResponse.js";

export const overview = async (req, res) => {
  try {
    const data = await DashboardModel.getDashboardOverview(req.user);

    return successResponse(res, {
      code: 1004,
      httpStatus: 200,
      data: {
        data,
      },
    });
  } catch (error) {
    console.log(error);
    
    return failureResponse(res, {
      code: 2008,
      httpStatus: 500,
      message: error.message,
    });
  }
};
