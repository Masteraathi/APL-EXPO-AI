/**
 * Computes Section 9 Sales & Management Dashboard metrics and reports.
 */
function buildDashboardReport(store, filters = {}) {
  const state = store.readState();
  const filtered = store.listEnquiries(filters);

  const totalEnquiries = filtered.length;
  const highPriority = filtered.filter((e) => e.visitPriority === 'HIGH').length;
  const visitsPlanned = filtered.filter((e) => Boolean(e.tentativeVisitDate)).length;
  const pendingAssignment = filtered.filter(
    (e) => !e.assignedSalespersonId && !e.assignedSalesperson
  ).length;
  const completedCount = filtered.filter((e) => e.enquiryStatus === 'Completed').length;

  // Enquiries by Product Category (using ENQUIRY_CATEGORIES link semantics)
  const categoryCounts = new Map();
  for (const cat of state.categories) {
    categoryCounts.set(cat.name, { category: cat.name, count: 0, highPriority: 0, active: cat.active });
  }
  for (const enq of filtered) {
    for (const catName of enq.productCategories || []) {
      if (!categoryCounts.has(catName)) {
        categoryCounts.set(catName, { category: catName, count: 0, highPriority: 0, active: true });
      }
      const bucket = categoryCounts.get(catName);
      bucket.count += 1;
      if (enq.visitPriority === 'HIGH') bucket.highPriority += 1;
    }
  }
  const byCategory = Array.from(categoryCounts.values()).sort((a, b) => b.count - a.count);

  // Enquiries by State / Region
  const regionCounts = new Map();
  for (const enq of filtered) {
    const region = enq.stateRegion || 'Other / Unspecified';
    if (!regionCounts.has(region)) {
      regionCounts.set(region, { region, count: 0, highPriority: 0 });
    }
    const bucket = regionCounts.get(region);
    bucket.count += 1;
    if (enq.visitPriority === 'HIGH') bucket.highPriority += 1;
  }
  const byRegion = Array.from(regionCounts.values()).sort((a, b) => b.count - a.count);

  // Salesperson-wise enquiry allocation
  const salespersonMap = new Map();
  for (const sp of state.salesTeam) {
    salespersonMap.set(sp.id, {
      id: sp.id,
      name: sp.name,
      region: sp.region,
      active: sp.active,
      total: 0,
      highPriority: 0,
      visitsPlanned: 0,
      completed: 0,
      pendingFollowUp: 0,
    });
  }
  for (const enq of filtered) {
    const key = enq.assignedSalespersonId || 'UNASSIGNED';
    if (!salespersonMap.has(key)) {
      salespersonMap.set(key, {
        id: 'UNASSIGNED',
        name: 'Unassigned Queue',
        region: 'Needs Allocation',
        active: true,
        total: 0,
        highPriority: 0,
        visitsPlanned: 0,
        completed: 0,
        pendingFollowUp: 0,
      });
    }
    const bucket = salespersonMap.get(key);
    bucket.total += 1;
    if (enq.visitPriority === 'HIGH') bucket.highPriority += 1;
    if (enq.tentativeVisitDate) bucket.visitsPlanned += 1;
    if (enq.enquiryStatus === 'Completed') bucket.completed += 1;
    else bucket.pendingFollowUp += 1;
  }
  const bySalesperson = Array.from(salespersonMap.values()).sort((a, b) => b.total - a.total);

  // Status breakdown
  const statusMap = new Map();
  for (const enq of filtered) {
    statusMap.set(enq.enquiryStatus, (statusMap.get(enq.enquiryStatus) || 0) + 1);
  }
  const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // High-priority leads pending follow-up
  const highPriorityPending = filtered
    .filter((e) => e.visitPriority === 'HIGH' && e.enquiryStatus !== 'Completed')
    .sort((a, b) => {
      if (a.tentativeVisitDate && b.tentativeVisitDate) {
        return a.tentativeVisitDate.localeCompare(b.tentativeVisitDate);
      }
      if (a.tentativeVisitDate) return -1;
      if (b.tentativeVisitDate) return 1;
      return b.enquiryDate.localeCompare(a.enquiryDate);
    });

  // Tentative Visit Calendar items
  const plannedVisits = filtered
    .filter((e) => Boolean(e.tentativeVisitDate))
    .map((e) => ({
      enquiryId: e.enquiryId,
      companyName: e.companyName,
      contactPerson: e.contactPerson,
      mobile: e.mobile,
      stateRegion: e.stateRegion,
      tentativeVisitDate: e.tentativeVisitDate,
      visitPriority: e.visitPriority,
      enquiryStatus: e.enquiryStatus,
      assignedSalespersonId: e.assignedSalespersonId,
      assignedSalesperson: e.assignedSalesperson || 'Unassigned',
      productCategories: e.productCategories,
    }))
    .sort((a, b) => a.tentativeVisitDate.localeCompare(b.tentativeVisitDate));

  return {
    cards: {
      totalEnquiries,
      highPriority,
      visitsPlanned,
      pendingAssignment,
      completedCount,
    },
    byCategory,
    byRegion,
    bySalesperson,
    byStatus,
    highPriorityPending,
    plannedVisits,
  };
}

module.exports = {
  buildDashboardReport,
};
