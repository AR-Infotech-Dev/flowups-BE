import * as CommonModel from "#shared/models/common.model.js";
import { MODULE_TABLE } from "./leads.constants.js";
export const getLeadById = (leadId) => CommonModel.getMasterDetails(MODULE_TABLE, "*", { lead_id: leadId });
export const createLead = (data) => CommonModel.saveMasterDetails({ table: MODULE_TABLE, data });
export const updateLead = (leadId, data) => CommonModel.updateMasterDetails({ table: MODULE_TABLE, data, where: { lead_id: leadId } });
export const deleteLeads = (ids) => CommonModel.deleteMasterDetails({ table: MODULE_TABLE, where: { lead_id: ids } });
