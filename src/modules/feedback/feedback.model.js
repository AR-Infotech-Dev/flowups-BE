import { DB_PREFIX, query } from "#config/database.js";
import * as CommonModel from "#shared/models/common.model.js";
import { prepareFilterData } from "#shared/utils/filter.builder.js";

export const reviewRatingSummary = async (company_id = null) => {
  const where = [];
  const params = [];

  if (company_id) {
    where.push("tk.company_id = ?");
    params.push(company_id);
  }
  const sql = ` SELECT rating_data.total_reviews, rating_data.average_rating, rating_data.five_star, ROUND( COALESCE( (rating_data.five_star / NULLIF(rating_data.total_reviews, 0)) * 100, 0 ), 0 ) AS five_star_percent, rating_data.four_star, ROUND( COALESCE( (rating_data.four_star / NULLIF(rating_data.total_reviews, 0)) * 100, 0 ), 0 ) AS four_star_percent, rating_data.three_star, ROUND( COALESCE( (rating_data.three_star / NULLIF(rating_data.total_reviews, 0)) * 100, 0 ), 0 ) AS three_star_percent, rating_data.two_star, ROUND( COALESCE( (rating_data.two_star / NULLIF(rating_data.total_reviews, 0)) * 100, 0 ), 0 ) AS two_star_percent, rating_data.one_star, ROUND( COALESCE( (rating_data.one_star / NULLIF(rating_data.total_reviews, 0)) * 100, 0 ), 0 ) AS one_star_percent FROM ( SELECT COUNT(f.ticket_id) AS total_reviews, COALESCE( ROUND(AVG(f.rating), 1), 0 ) AS average_rating, COALESCE( SUM(CASE WHEN f.rating = 5 THEN 1 ELSE 0 END), 0 ) AS five_star, COALESCE( SUM(CASE WHEN f.rating = 4 THEN 1 ELSE 0 END), 0 ) AS four_star, COALESCE( SUM(CASE WHEN f.rating = 3 THEN 1 ELSE 0 END), 0 ) AS three_star, COALESCE( SUM(CASE WHEN f.rating = 2 THEN 1 ELSE 0 END), 0 ) AS two_star, COALESCE( SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END), 0 ) AS one_star FROM ${DB_PREFIX}ticket_feedback AS f INNER JOIN ${DB_PREFIX}tickets AS tk ON tk.ticket_id = f.ticket_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ) AS rating_data `;
  const result = await query(sql, params);
  return result;
};
