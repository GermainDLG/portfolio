Omniscience UI Handoff

Problem:
Currently, Omniscience uses a spreadsheet to make novel-canonical database column pairings. This is slow and inefficient, because the users have to manually go through every single incoming column, and for each column must go through every canonical column in each table to find a pairing.

Design Choices:
The goal of this project is to speed up the process of making novel-canonical column pairings. Through multiple iterations of varying UIs, we have	 landed at a heatmap table display, where novel columns are along the y-axis and canonical columns are listed along the x-axis. This decision was made due to research ([BDIViz](https://arxiv.org/pdf/2507.16117)) that showed that systems such as iterating through each column pairing or showing the entire tables more visually did not scale well as the tables grew. It also showed that heatmaps support this level of scalability, which is needed as the incoming (novel) and target (canonical) tables could have anywhere up to 45 columns each.

This UI also takes inspiration from ([Github Desktop](https://github.com/apps/desktop)), seen below. We had decided that we would use it as a template, and make our iterations from this UI, since Github had already put effort and applied design principles in creating their UI. When viewing Concordia, our UI, you can still see the left-hand sidebar, as well as a toolbar along the top row.

We have decided to part from the github desktop UI, however, by removing the bottom left “Commit” button and instead applying our own continue popup that can be opened either by clicking the continue button on each column or pressing enter. This was made with [Fitt's Law](https://en.wikipedia.org/wiki/Fitts%27s_law) in mind, which shows that having a commonly-used button on the opposite side of the screen would increase time spent navigating. Moving the button closer to where the mouse would naturally rest or already be located and continuing the decision-making workflow (Accept/Reject, etc.) lowers the overall time spent per pairing. 

Next Steps:
	The most important next step is to get feedback directly from the users, Omniscience. From this, we should be able to make tweaks or changes to fit their personal workflow. Aside from this, some other next steps are:
- Pairing the dashboard with google calendar, so users do not have to input their calendar. Instead, the dashboard could automatically get the most up to date information and allow the admin to create meetings
- Review feedback on how the heatmap feels when it uses two large tables (i.e. a 45x45 heatmap). This is the area we feel is most subject to change or may need additional focus.


Timeline and Run Instructions:
github-basic → github-recommended → github-table → popup-action → table-vs-column → heatmap

For the most recent iteration, open the “heatmap” folder, go to either “grader-flow” or “admin-flow”, right click “index.html” and click “Open with Live Server”. If this option isn’t there, you may need to install the “Live Server” extension by Ritwick Dey. It does not matter whether you open the HTML file in grader or admin flow, because you can navigate between them in the page.
