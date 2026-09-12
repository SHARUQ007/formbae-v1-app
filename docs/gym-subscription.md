# Gym subscription dates

Gym details use a calendar picker for the start date and a duration of 1, 3, 6,
12, or a custom 1–120 whole months. The form shows the calculated end date without
asking the member to enter it. The picker includes month/year selection, Today,
confirmation and cancellation, with the app's existing dark surfaces and gold
selection. It uses the existing React Native and SVG dependencies.

The existing `lifestyleJson` stores `gymMembershipStart`, the new string field
`gymMembershipMonths`, and the calculated `gymMembershipExpiry`. The expiry field
remains compatible with the backend and admin monitors. Dates use local calendar
days, avoiding UTC conversion; adding months clamps to the last valid day of a
shorter month. For example, 31 January plus one month ends on 28 February (29 in a
leap year).

Existing exact month intervals preselect the matching duration. Older irregular
intervals retain their expiry when other details are saved; choosing a different
start or duration replaces that interval with the newly calculated date. A day
pass needs only a visit date and saves the same start/expiry. Not joined clears
membership dates and duration. Selecting another gym or removing the gym clears
the duration with the other membership fields.

Validation covers calendar selection/cancellation, month/year navigation,
month-end and leap-year arithmetic, custom duration validation, legacy data,
day passes, profile persistence and removal. The actual components were also
checked with browser fixtures at 390px and 320px widths, including a leap-day save,
without overflow or browser errors. This does not replace a native device check.
