# 07. deciding when to interrupt

*sept 27, 2026*

answering is the easy part of an assistant. the hard part is deciding what to say when nobody asked. the first place that shows up in onboarding is the moment gmail connects. before today the bot said "i see 7 unread in there", which is true and useless. it's a number, not help.

## the rule

interrupt only when waiting would cost the person something: a deadline, money, or a person waiting on them. it also has to be confident, and the item has to be something they can act on right now. everything else goes into a digest.

in code (`src/lib/triage.ts`):

- **hard rules for the clear cases.** "payment failed", "overdue", "final notice" is money. "following up", "any update", "still waiting" from a real person is someone waiting. "today", "tomorrow", "expires", "by friday" is a deadline. promotions, social, updates, and no-reply senders never interrupt unless money is involved.
- **a model for the rest.** weak signals (a question mark, the word "invoice", "interview") only get a category with low confidence. those go to the model with a conservative instruction, and anything it's unsure about goes to the digest. the model never sees message bodies, only sender, subject and gmail's short preview.
- **a budget.** one interruption per onboarding, three a day. a budget keeps the bar high, because if everything interrupts, nothing does.
- **evidence.** the agent has to say why ("maya is following up and waiting on your interview times"), not just what. the same idea runs through praxic, my startup: every suggestion comes with the evidence behind it, and the person's approve or reject is the training signal.

## measuring it

every interruption is logged on the session with its category, reason and outcome. the next thing the user says marks it acted on ("yes, draft it"), dismissed ("not now"), or ignored. the numbers that matter are the share acted on and the share dismissed, per category, since a category that keeps getting dismissed has a rule that's too loose.

the harder number is the alerts it should have raised but didn't, because those leave no signal. the way i'd get at it: sample items that went to the digest and ask people whether they'd have wanted to hear about them sooner. that's not built here, but the log is shaped for it.

## what the tweets changed

people who tried persona talk most about one thing: it makes calls for you. it called a hard-to-get new york restaurant a few times and got the reservation. it waits on hold, and it calls five hotels at once and reports back. so when someone doesn't know what to use it for, the agent now leads with a call-based example that fits them, instead of a list of features.

## sources

- the interruption rule is my own answer to "how would you decide that something in a user's data deserves interrupting them", written for this trial
- praxic: https://www.krishpunjabi.com/projects/praxic
- rudy arora (@rudybuild) on x, sept 15, 2026, on persona calling a restaurant for a reservation, and the quote post listing hold times and parallel hotel calls
- gmail api, messages.list and messages.get with format=metadata: https://developers.google.com/gmail/api/reference/rest/v1/users.messages
