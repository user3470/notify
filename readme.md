<a href="https://simpleanalytics.com/?ref=github.com/simpleanalytics/notify">
  <img src="https://assets.simpleanalytics.com/images/logos/logo-github-readme.png" alt="Simple Analytics logo" align="right" height="62" />
</a>

# Telegram Bot

We rely on Telegram integrations to get alerts when certain events happen. We also use this bot to create new issues in GitHub and push tasks to [WIP.chat](https://wip.chat/). This way we can update external systems without having to leave our current workflow.

## Create GitHub issues and WIP taks

Within our Telegram chat you can type `/todo A task that needs to be done`. This triggers a new open issue within GitHub with the first line of the message as a title and the rest of the message as a description of the issue.

When you type `/done A task that has been done` it triggers two actions. It adds a new issue to closed GitHub with above information. It also adds a finished task on [WIP.chat](https://wip.chat/). This way we keep our tasks up to date with the community in both platforms.

## GitHub notifications

We sometimes forget a comment on GitHub. It's nice to have those notifications in one Telegram group as well. This way you can close all your tabs and have less distractions. You can easily mute Telegram if you want to work without any distractions at all.

## Email notifications from Mailgun

We also get notifications when we get an email from Mailgun. This way you don't need to check your email app all the time and you can communicate about that email in the Telegram group. We have a support group where you can then talk about those emails with other employees.

## Forward alerts from hyperping

We get alerts from [Hyperping](https://hyperping.io/) and forward these to our Telegram channel. Here is how you can trigger such an alert.

```
curl -X "POST" "http://localhost:3000/hyperping" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d $'{ "event": "check.down", "check": { "status": 500, "down": true, "downtime": 5, "url": "http://example.com" } }'
```
