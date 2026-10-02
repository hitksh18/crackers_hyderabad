/* Counter billing terminal: ONLY these Firebase roles may hold a session or
   pass the route guard. Every other role is rejected at login and at routing. */
export const BILLING_ROLES = ['admin', 'sales'];
