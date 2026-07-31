-- Sermon: "Relationships: Betrayal, Example, and Failure" — John 13:21-38
-- Charleston Baptist Church Sunday Service, 2026-07-26. Speaker: Marvin Quiambao.
--
-- Seeds three things, all idempotent so the migration can be re-applied safely
-- — with one caveat now that 20260731010000 exists: step 3 below upserts with
-- `on conflict (talk_id) do update set report = excluded.report`, so manually
-- re-applying THIS migration overwrites the ESV-grounded report with the WEB
-- one seeded here. A normal ordered migration run is unaffected (each applies
-- once, and 20260731010000 sorts after this). If you do re-apply this file by
-- hand, re-apply 20260731010000 afterwards.
--   1. the Sunday Service calendar event for 2026-07-26,
--   2. the sermon_talks row (summary, key takeaways, boundary-trimmed transcript,
--      YouTube link) linked to that event,
--   3. the berean-v4 analysis in sermon_talk_berean.
--
-- The Berean report was produced with the pipeline defined in
-- .agents/skills/sermon-berean-review and supabase/functions/berean-analysis:
-- pass 0 boundary trim, pass 1 scripture-usage extraction, mechanical grounding
-- (every card carries fetched passage text, never model memory; quoteVerified
-- and quoteMatch computed by the textmatch.ts algorithms), pass 2 assessment and
-- maturity scoring, pass 3 illustrations.
--
-- Grounding text note: as seeded here, cards are grounded in the public-domain
-- World English Bible — the `free:web` fallback that bible.ts uses when ESV is
-- unavailable — because no ESV API key was reachable from the environment that
-- ran this pass. The speaker reads the ESV, so wording differences alone
-- depressed quoteMatch across every verbatim card, pushing two (John 13:21-30
-- at 0.58 and John 13:30 at 0.55) below the 0.6 "weak text match" threshold;
-- both explanations say so explicitly.
--
-- 20260731010000_reground_john13_berean_esv.sql supersedes that: it refetches
-- every card's passage text as ESV and recomputes quoteMatch, keeping this
-- analysis otherwise byte-for-byte. Apply both, in order.
--
-- Do NOT "fix" the grounding by re-running the berean-analysis edge function.
-- It does replace the report in place, but it runs BEREAN_GEMINI_MODEL — as of
-- this writing gemini-3.1-flash-lite — which extracts only explicit verbatim
-- quotations. Re-running it against this transcript yielded 16 cards with zero
-- allusions, paraphrases, or uncited claims and maturity 2.75, silently
-- dropping both flagged findings (the 4/6 Decalogue division on Exodus 20:1-17,
-- an allusion, and the creation-Sabbath claim on Hebrews 4:9-11, an uncited
-- claim). Neither was re-judged as aligned — neither was surfaced at all. The
-- analysis seeded here came from the stronger agent pipeline, which is why its
-- model field reads `agent:sermon-berean-review` rather than a gemini id.

do $$
declare
  v_org_id   uuid;
  v_event_id uuid;
  v_talk_id  uuid;
begin
  select id into v_org_id
  from public.organizations
  where name ilike '%charleston baptist%'
  limit 1;

  if v_org_id is null then
    raise exception 'Organization "Charleston Baptist Church" not found — check the organizations table.';
  end if;

  -- ── 1. Sunday Service calendar entry ──────────────────────────────────────
  select id into v_event_id
  from public.calendar_events
  where organization_id = v_org_id
    and date = date '2026-07-26'
    and category = 'service'
  limit 1;

  if v_event_id is null then
    insert into public.calendar_events (title, date, category, description, organization_id)
    values (
      'Sunday Service',
      date '2026-07-26',
      'service',
      'Gospel of John series — John 13:21-38, "Relationships: Betrayal, Example, and Failure." Guest preaching: student pastor Marvin Quiambao.',
      v_org_id
    )
    returning id into v_event_id;
  end if;

  -- ── 2. Sermon / message ───────────────────────────────────────────────────
  select id into v_talk_id
  from public.sermon_talks
  where organization_id = v_org_id
    and talk_date = date '2026-07-26'
    and title = 'Relationships: Betrayal, Example, and Failure'
  limit 1;

  if v_talk_id is null then
    insert into public.sermon_talks (
      organization_id, event_id, title, category, speaker_name, scripture_ref,
      talk_date, summary, transcript, key_takeaways, video_url, is_published
    )
    values (
      v_org_id,
      v_event_id,
      'Relationships: Betrayal, Example, and Failure',
      'sermon',
      'Marvin Quiambao',
      'John 13:21-38',
      date '2026-07-26',
      $summary$Preaching from John 13:21-38 while Pastor Kevin is away on the Ecuador trip, student pastor Marvin Quiambao continues Charleston Baptist's series in the Gospel of John, reading the passage in light of John's own stated purpose in John 20:30-31. He works the text in three movements — the relationship betrayal (vv. 21-30), the relationship example (vv. 31-35), and the relationship failure (vv. 36-38) — reconstructing the low, U-shaped triclinium table so the congregation can see that Jesus handed the morsel to Judas from a seat of honor rather than distancing himself from his betrayer, and that Satan's entry follows the betrayal rather than causing it.

From each movement he draws applications and then tests them out loud against his own family. Betrayal calls for sanctifying our emotions rather than being enslaved to them or suppressing them, trusting God's sovereignty as a conditional promise whose "good" is conformity to Christ (Romans 8:28-29), being gracious toward the one who wounded us, and praying in spiritual conflict (Ephesians 6:11-18; Luke 22:31-32). Jesus' new commandment sets the measure of love at "just as I have loved you" — self-sacrificial, unconditional, forgiving, and aimed at reconciliation, and that love is how the world identifies his disciples. Peter's coming denial then shows that God fully knows us and still fully loves us, so the answer to certain failure is not more self-effort but abiding in Christ (John 15:4-5) and receiving his rest (Matthew 11:29-30). Throughout, Marvin narrates his own story: leaving home for the Navy at seventeen, his younger brothers' long-held resentment at that departure, his defensiveness when he first heard it, and the slow reconciliation that brought his mother and both brothers together at his son Sam's wedding the month before. He closes with a call to the altar from Matthew 5:23-24 and a reading of Psalm 34.$summary$,
      $transcript$I am super excited to share the word of God with you and continue in our series in the Gospel of John. We're going to be in John chapter 13, but I do want to go back to our purpose verse in John chapter 20, verses 30 and 31. It says, "Now Jesus did many other signs in the presence of his disciples, which are not written in this book, but these are written so you may believe that Jesus is the Christ."

We just finished music camp, and it was amazing to hear the kids put the songs together, talk about Matthew, Mark, Luke and John and all the different unique aspects of the Gospels, and how they testify of the person of Jesus Christ. Each of them has a specific message that teaches us an aspect of Jesus. It's so amazing that we have four distinct accounts, and we have been going through the book of John.

I'm going to read through our entire passage. We'll be in John chapter 13, verses 21 through 38. We're going to read through the entire passage, and then we'll slow down [and see what] the Lord has for us. And I'll pray. So if you don't have a Bible, there should be one in front of you or underneath the seat you're sitting in. If you want to turn to page 997 — I mean, if you don't have a Bible, we encourage you to keep that Bible. Consider that as a gift from our church to you. We think everyone should have a Bible. I'll encourage you to write in it, highlight it, but most importantly, spend time reading it.

So I'm going to read our passage, and then I'm going to pray, and we'll get into the passage. John chapter 13, verses 21 through 38:

"After saying these things, Jesus was troubled in his spirit, and testified, 'Truly, truly, I say to you, one of you will betray me.' The disciples looked at one another, uncertain of whom he spoke. One of his disciples, whom Jesus loved, was reclining at the table at Jesus' side, so Simon Peter motioned to him to ask Jesus of whom he was speaking. So that disciple, leaning back against Jesus, said to him, 'Lord, who is it?' Jesus answered, 'It is he to whom I will give this morsel of bread when I have dipped it.' And when he had dipped the morsel, he gave it to Judas, the son of Simon Iscariot. Then after he had taken the morsel, Satan entered into him. Jesus said to him, 'What you are going to do, do quickly.' Now no one at the table knew why he said this to him. Some thought that, because Judas had the money bag, Jesus was telling him, 'Buy what we need for the feast,' or that he should give something to the poor. So, after receiving the morsel of bread, he immediately went out. And it was night.

"When he had gone out, Jesus said, 'Now is the Son of Man glorified, and God is glorified in him. If God is …' Little children, yet a little while I am with you. You will seek me, and just as I said to the Jews, so now I also say to you, "Where I am going you cannot come." A new commandment I give to you, that you love one another: just as I have loved you, you also are to love one another. By this all people will know that you are my disciples, if you have love for one another.'

"Simon Peter said to him, 'Lord, where are you going?' Jesus answered him, 'Where I am going you cannot follow me now, but you will follow afterward.' Peter said …"

So as we spend time contemplating and understanding the purpose statement — why John wrote this Gospel — and where this passage fits in light of that, we see three things. We see the relationship betrayal, the relationship example, and the relationship failure.

Before we go into it, I want to share a little bit about myself. If you guys don't know, I am the student pastor here. Pastor Kevin's away on our Ecuador trip, and [I'm carrying] our study through the Gospel of John.

As we look at these relationships that we're going through, I want to share a little bit about my own personal family dynamics and family relationships. I was born in the Philippines, but I grew up in California. I grew up in Silicon Valley, and my parents divorced when I was in middle school. My mom worked as a cashier at the military commissary — that's how we came to America. My dad joined the Navy from the Philippines, and that's how he came to America. She was a cashier, and when my parents split up my mom was raising her three boys: me and my two younger brothers.

At the age of 17 I left for the Navy after high school. I graduated, and I was going through boot camp. I've got a picture of the day we left back in '98. They were at the airport saying goodbye to me. I was 17 at the time. My second brother, Mark, was 15, and the youngest at the time was Jay, who was 12.

Within the last year my youngest brother Jay was sharing with me that Mark, my second brother, had been harboring feelings toward me of anger and resentment — angry that I left them at such an important stage of their life. My younger brother said he felt hurt and abandoned, as they had been talking amongst themselves, trying to process their own resentment towards me.

In sharing that, I instantly got defensive. I was like, "You were upset about me leaving? I left home at 17 and I went into a hostile environment that was meant to break you down."

I remember being at boot camp and celebrating my 18th birthday. Now, those guys who have gone through the military — they celebrate in a different way. My mom sent a care package and cookies, and my RDC, my recruit division commander — similar to a drill sergeant — got the package and was going through it. He's like, "Oh, it's your birthday today. All right, for your birthday we're going to do push-ups." So the whole division got in push-up position. My mom's thinking it's like a nice little treat, and they're eating my cookies while I was doing push-ups with the whole division, right? That's the gift that I got — to work out.

I also remember being up at 2:00 in the morning. After a long day of working out, running drills, classes, we would have to stand watch within the barracks, and we would have to rove around to make sure nobody came in and did anything. And if you fell asleep you would get what's called a MOD — an assignment memorandum — which would push you back to start boot camp all over again. So you didn't want to do that. But it was 2:00 in the morning and I was exhausted, and I remember thinking to myself, "Lord, what am I doing? This is crazy. Why am I here?"

So those feelings of anger and resentment that my brothers were sharing — while I remembered going through my own feelings at that time, you know, I was upset that they were saying they were upset with me when I was going through some hard times at the time too. But they said they're still trying to process their hurt. And I know that most of you have stories similar — a similar story.

Jesus is going to give us an example. Again, the three points that we're going to go through are in there too. Again, have your Bible, because we're going to spend time reading it slowly. We're going to ask the Lord to guide us in his Holy Spirit. Let's pray. We'll ask him to do that.

Dear Heavenly Father, Lord, we are thankful for your word. We are thankful that John was faithful to record the things that have taken place, that your Holy Spirit has guided him in putting this together. So Lord, as we look and reflect, Lord, I pray that I step to the side and that your word can be the teacher. Lord, I pray that your Spirit can teach us how we can apply it — that your Spirit not just will help us take it into our ears, but put it into action in our lives. And so Lord, as we spend time in here, may you be glorified. In Jesus' name, amen.

All right, so turn to John 13, verse 21: "After saying these things, Jesus was troubled in his spirit."

So John is using a narrative technique here, a technique that's going to take us on a journey. And right off from the beginning we see a conflict occur. Somebody is going to betray Jesus, and the disciples weren't sure who it was.

Now let's put this back in context. If you don't know — a lot of times when we think of the Lord's Supper, we think of Leonardo da Vinci's painting, of everyone kind of sitting in a row and Jesus is in the middle. But that's not likely what it was like. Pastor Kevin shared a picture: this U-shape arrangement was very common. It's called a triclinium. They'd sit low, and as they sat and ate, the diners would recline on their left arm and use their right hand to eat.

It was often positioned in a strict social hierarchy. Where they sat mattered, because it said a lot about their social status. The two most honored guests sat immediately beside the host — the person on the right and the left. This could be why they were arguing about who was greatest in the kingdom.

Last week Pastor Kevin shared: starting from the left would have been John, the trusted friend. Some say that the youngest celebrant would be positioned near the host, so that's a common thing. On the [other] side of John would have been Peter, who took the role of a servant — easy to get access to things, easy to get up and take care of things when they came up. So just keep that in mind as we continue to go through this story. Go back to John: right next to John would have been the host of the event, so that's where Jesus was sitting. And then next to Jesus, on the left, is where Judas was sitting — the position of the honored guest.

Let's continue reading. Now you've got the picture in your mind; let's continue to read verse 23: "One of his disciples, whom Jesus loved, was reclining at the table at Jesus' side, so Peter motioned to him to ask Jesus of whom he was speaking."

So if you can imagine, as Jesus is talking about someone betraying him, Peter's probably like, "Hey, John, ask Jesus who he's talking about." So Peter is over there [signaling] John, and John is already close — he just needs to lean a little bit.

Now let's get into verse 25 — "when he had dipped the morsel, [he gave it] to Judas, the son of Simon Iscariot." So in that seating arrangement, eating was a very intimate thing. Those days — it is today, too — they would have food at the table and they would pass it along and share it. When they grabbed bread they would have grabbed from the same loaf, and in fact sometimes if they would dip their food, they would dip it from the [same] plate, and they wouldn't care about double dipping, right? That was the culture. That was the intimacy that was taking place. And so for Jesus to do this would not have been strange at the time. And it is the point of the story that John is bringing us to — a climax. The betrayer is revealed.

Verse 27: "Then after he had taken the morsel, Satan entered into him." So here we see Jesus is letting us know Satan is involved in this transaction.

Verses 28 and 29: "Now no one at the table knew why he said this to him. Some thought that, because Judas had the money bag, Jesus was telling him, 'Buy what we need for the feast,' or that he should give something to the poor." So the rest of the disciples didn't get the interaction between Jesus and John. They just heard Jesus' comment to Judas and were trying to figure out the context. And if you're unfamiliar with Judas' role among the disciples, he was responsible for the money. Throughout the Gospels we see Judas carrying that role, and we see glimpses of his responsibility in that.

Verse 30: "So after receiving the morsel of bread, he immediately went out. And it was night." So here we have the resolution of this particular story, and we see the betrayer revealed.

Now, I think a lot of us are super familiar with the overall view of the story, but I think it's important for us to slow down, like I shared earlier, and just take time to ask the Spirit what he's trying to teach us in light of this. And so, as we go into the different portions, I put together some application that we can take away and apply into our lives.

So what we see here is Jesus being betrayed. Let's look at that and see how we can apply what we have read into our life.

At the beginning we see Jesus sanctify his emotions. He has emotions. In verse 21 it says, "After saying these things Jesus was troubled in his spirit." He's troubled. So we can see that Jesus was upset — he had emotions.

Now, all of us are going to fall somewhere in this spectrum. We are either going to be slaves to our emotion, where everything we feel, everybody is going to know about it, and I'm going to respond to how I feel — or you're just going to deal with it. Or we're going to be on this side of the spectrum where we're going to suppress our emotion. We're going to be like, "Nobody's going to know what I'm doing. I shouldn't feel this way." And it's just going to stay inside, and you're going to boil up and boil over.

But what we're called to do is sit in the middle and sanctify our emotion. It's okay for us to have emotions, but we need to make sure our emotions are shaped by the word of God. So we don't want to be slaves to it, we don't want to suppress it — you want to sanctify it.

And so Jesus, he was upset. He shared that. In verse 21 it says, "After saying these things." It's important for us to realize, when we see passages like that, this is a passage within the context of something. So what was it that he just said? If you don't remember, I'm just going to give us a quick snapshot of what was taking place there.

So Jesus knew Judas was going to betray him, but despite that he trusted God in his sovereign plan. So the next application we have is: we need to trust in God's sovereignty.

Now there are scriptures that talk about his sovereignty, and one of them I like to go back to is Romans 8:28. It says, "And we know that for those who love God all things work together for the good, for those who are called according to his purpose."

Now, this doesn't mean that everything that happens is good, or that there's a silver lining in everything. It's actually a conditional promise — it's for those who love God and those that are called according to his purpose. So it's not for everyone. But what it does mean is nothing enters a believer's life without passing through God's loving filter. He is in total control and can bring profound redemptive value out of deep suffering. All things [work] together for the good.

That good is described in verse 29 of Romans 8. So the good in verse 28 is not our comfort, not our ease — it's to conform us to the image of Jesus. And so if we understand and recognize that things that happen around us are for our good, to conform us to Jesus, we can trust in God's sovereignty.

Now the next application I think we can take in regard to this betrayal is to be gracious — in a seat of honor. Rather than distancing himself from his betrayer, Jesus positioned Judas in a place of honor. Now just think about ourselves: how do we respond when someone's betrayed us? We either want to avoid them, or we want to figure out how to get back at them, right? The last thing we want is to put them in a [place of honor]. He put that person in a place of honor. So we need to be gracious.

The last application from this section is to pray — pray in the midst of spiritual warfare. In verse 27 it says, "Then after taking the morsel, Satan entered into him." So Jesus is pulling back the curtain, showing us there are spiritual forces in our world today, especially in conflict.

Ephesians 6:11-12 says, "Put on the whole armor of God, that you may be able to stand against the schemes of the devil. For we do not wrestle against flesh and blood, but against the rulers, against the authorities …" Paul goes on to talk about putting on the armor of God and what that looks like. And at the very end of it, in verse 18, he encourages them to pray. It says, "Praying at all times in the Spirit, with all prayer and supplication. To that end, keep alert with all perseverance, making supplication for all the saints."

Especially in conflict, there are many voices trying to give us direction, telling us where to go, how to resolve certain things. And if we're not careful we start to ignore the truths of God, and we start to listen to the lies of Satan. And when Satan gets a foothold, we start acting out of character. We can almost come across as [someone else] in this.

In fact, Jesus even prayed for Simon Peter against the work of Satan. Luke 22:31-32: "Simon, Simon, behold, Satan demanded to have you, that he might sift you like wheat, but I have prayed for you that your faith may not fail. And when you have turned again, strengthen your brothers."

Those are a couple of applications we can have when we see the betrayal that Jesus is experiencing.

The next portion we're going to look into is the relationship example. Verse 31: "When he had gone out, Jesus said, 'Now is the Son of Man glorified, and God is glorified in him. If God is …'"

So we see a shift in the scene. Jesus has gone out — but what and why is he talking about being glorified? What's going on here?

Pastor Kevin has highlighted the shift from Jesus' public ministry to private ministry taking place in chapter 12. And as we've been reading throughout the whole Gospel of John, there have been miracles that have been highlighted to kind of fulfill the purpose statement of John — that we may know that Jesus is the Son of God and have life through him. But throughout those narratives there's a phrase that comes up often. It says that "my hour has not yet arrived." So I encourage you — we're going to go through these kind of in rapid succession, but if you're writing them down, spend time reading them in context to understand. This is important before we get into our passage. So John 2:4, John 7:30, John 8:20 — those are prior to John 12.

Now we're going into John 12:23-24. It says, "And Jesus answered them, 'The hour has come for the Son of Man to be glorified. Truly, truly, I say to you, unless a grain of wheat falls into the earth and dies, it remains alone, but if it dies, it bears much fruit.'" John 12:27. Now in the beginning of our chapter 13 it says [the same thing].

So the glorification Jesus is talking about — that's what we're talking about — is going to happen on the cross. Jesus is talking about his crucifixion. It's going to be the hour, the glorious hour, the glorification that's going to happen. So it's important to understand that when we get into verses 33 through 35. It says, "and just as I said to the Jews, so now I say it to you, 'Where I am going you cannot come.' A new commandment I give to you, that you love one another: just as I have loved you, you also are to love one another. By this all people will know that you are my disciples, if you have love for one another."

So is loving each other a new commandment? I mean, if you look at the Ten Commandments, the first four are how we're supposed to love God, and the last six are how we're supposed to love one another. And it also talks about loving your neighbor in the Levitical laws. If you look at Leviticus 19:18, it says, "You shall not take vengeance or bear a grudge against the sons of your own people, but you shall love your neighbor as yourself." Leviticus 19:34 says, "You shall treat the stranger who sojourns with you as the native among you, and you shall love him as yourself, for you were strangers in the land of Egypt. I am the LORD your God."

So just in this small passage, what are some applications? What are some differences between [how] the scriptures teach us to love others in the Old Testament versus Jesus saying "I'm giving you a new commandment" here in the New Testament?

What is the context of the passages in Exodus and Leviticus? The law was for the people of God to learn how to conduct themselves — in their city laws. They were meant to be a people who represented God to the world.

Now what's the context with Jesus in this passage? Let's look at what he was going to do, because he talked about being glorified. What was his reason for going to the cross? Jesus is restoring the nations to their Creator. He loved people to restore their relationship with God. The context of this new type of love that Jesus is talking about is in the context of an agape love.

Let me ask you this: how would you describe Jesus' love for us? How would [you describe] the new commandment Jesus is giving to his disciples?

And so what are the applications for our relationship example? Jesus loved with self-sacrifice. John 15:13 says, "Greater love has no one than this, that someone lay down his life for his friends." So he wants us to love in that type of manner.

Jesus loved unconditionally. Romans 5:8: "But God shows his love for us in that while we were still sinners, Christ died for us." Paul is writing to a church in Corinth about how they're supposed to love each other, because they're failing at it, and this is how he describes it — 1 Corinthians 13:4-7: "Love is patient and kind; love does not envy or boast; it is not arrogant or rude. It does not insist on its own way; it is [not] irritable or resentful; it does [not] rejoice at wrongdoing, but rejoices with the truth. Love bears all things, believes all things, hopes all things …" We're supposed to love unconditionally.

Jesus' love also forgave others. Luke 23:34 — Jesus' love is to forgive others, and we should reflect that. Luke 23:34: "And Jesus said, 'Father, forgive them, for they know not what they do.' And they cast lots to divide his garments." So we're supposed to be loving to forgive others also.

The last one: Jesus loved to reconcile us to God. Jesus died on the cross to reconcile [us].

Now can you imagine what our relationships would be like if we loved each other the way that Christ loved us? And he said that is how the people — that's how the world is going to know you're my people. This type of love. That love would be so radical that it'd be hard not to take notice of it. [With] people struggling with, you know, the social struggles, things like that — if they were to come to see a place where the people of God loved each other in the way that Christ loved us, by going on the cross… That's what Jesus is saying: "I'm about to be glorified. Take note of that. Love each other that way. That's how they're going to know you're my disciples."

And so, that's a hard call. For us to love like that can almost seem overwhelming. Like, somebody betrays me and I'm supposed to love [them]? I don't know if I could do that. And I think a lot of us can understand that tension. And that's what brings us into our final section: the relationship failure.

John 13:36-37. John 7:33 — so he says it there. And in John 8:21 he said to them [the same]. Again, read the context of these verses. The Jews, when Jesus was telling them, didn't understand, and Jesus had to explain over and over again. But here in our particular passage, Peter still does not understand.

Now, despite not understanding, Peter has heart, and he's willing to lay down his life for Jesus. So I think Peter becomes relatable because of that. A lot of times we don't understand things — Peter just jumps all in. We can understand and relate to that. But here we see that he's telling Jesus, "I'm willing to die for you."

Now this next verse is something beautiful that will take place. Verse 38 — Jesus answered [him, "Will you lay down your life for me? Truly, truly, I say to you, the rooster will not crow till you have denied me three times."]

So where's the beauty in that? The beauty is that Jesus knows. He knows our failures. He knew Peter's failure, and he still loved him. Jesus knows our failure and still loves us, right?

So where's the application in this small set of verses? The first thing we need to recognize is: we're going to fail. We will fail — especially when we're like Peter and try to do things in our own strength. Try to live the Christian life in your own strength; you're going to be exhausted, and you're going to fail over and over and over again.

But what's beautiful is that God fully knows us, but he still fully loves us. Now think about that. That is something we all desire in our relationships around us. We want to be fully known by the other person or the other people, and we wonder if they would fully love us. We want to be fully loved, but we're scared, because we know if we let them know some of these dark parts of us they might reject us. So to be fully known but not fully loved — that's our deepest fear. But to be fully loved but not fully known is too shallow for us to want to stay there. So in this passage we see that God fully knows and still fully loves us. That's a beautiful thing. That's a beautiful thing.

Romans 3:23: "For all have sinned and fall short of the glory of God." So God knows that we have sinned, we're going to fall short — and if you continue reading, again, this within its context, it is amazing. So it's to help us to recognize that we will fail. And just like Peter did — he did fail.

So what are we supposed to do when we know we're supposed to fail? Jesus is going to go into this more in John 15, but we should abide. Abide. What does that mean? I don't know if you use that word as much in our normal language, but it's very common in the book of John, and the Greek word is menō. Menō. And it literally means to remain in a place with somebody — just spend time with someone. This word is one of my favorite words.

Listen to what Jesus says about abiding in John 15. We actually sang about it with our music camp. It says, "Abide in me, and I in you. As the branch cannot bear fruit by itself unless it abides in the vine, neither can you unless you abide in me. I am the vine [you are the branches. Whoever abides in me and I in him, he it is that bears much fruit, for apart from me you can do nothing.]"

Those are strong words. Like — you can do nothing apart from Jesus. We are supposed to spend time with Jesus and abide in him, because apart from him we can [do nothing].

[The application] for this portion is that we're to rest. There's no point in stressing about things we have very little control over. We are to work side by side with Jesus, and when we abide in him he offers us rest. Matthew 11:29-30 says, "Take my yoke upon you, and learn from me, for I am gentle and lowly [in heart, and you will find rest for your souls. For my yoke is easy, and my burden is light.]" Jesus calls the people to come and find rest — not to be called to carry the heavy burdens of religious legalism. Jesus is restoring the rest that was meant to take place in the creation narrative. The seventh day of creation was meant for eternity.

Now let's put this all together. Let's think about the different relationship challenges that we have been through. Let's ask the Holy Spirit to teach us and make this personal. Think about a relationship struggle that you're having right now. Think about a betrayal that might have happened in the past. We will have relationships, and relationship betrayals. We will. Jesus did.

Let's pick one of the applications and think it through. Could you sanctify your emotions? Well, as my brothers were sharing — as my younger brother was sharing what they were processing — I wanted to lash back out at them: "You're not the only one who was scared, alone, angry, frustrated." But the Lord told me to be quiet. He said, "Wait. Wait to speak." So I did.

Did I trust in God's sovereignty? Was me leaving at the time that I did part of God's plan? Did God use that to bring good in my life, and also to grow my brothers? Yes. I could trust in that — in God's sovereignty.

Could I be gracious? I didn't realize the role that I played in my younger brothers' lives. When my parents divorced, I stepped into the father role and male role model for them. And after going through that early on in life, to again have it repeated at age 15 and at age 12 — I didn't realize the hurt that it was causing them. So I needed to be gracious. I pray with them often for healing. We pray for the gratitude that the Lord has worked out in our lives.

And so, as you think about your relationship betrayals, what is the Holy Spirit teaching you to apply? As we look at Jesus' example on the cross, are we following that example? Do we love with self-sacrifice? Do we love unconditionally? Do we love so that we can forgive others? Do we love so people can be reconciled to God? God's love in our lives allows us to work through the hurt we experience.

And then what happens when we fail? Do we acknowledge our failure? Do you abide? Do you rest? To be honest, this is probably the area I struggle most — you can ask my family. I struggle at letting them know when I mess up. I am a go-go-go person; I don't like to sit still. So when the Lord is telling me to do that, it takes a lot for me to listen. But the Lord's working that out in me. He's teaching me through his word. And I'm praying that as I continue to work this out with my family, God can get the glory in the midst of it.

Just this last month my son Sam got married, and my mom and two brothers were able to come for the wedding. And this was in the last 28 years that I've been out of the home, in the military. And here in Charleston, my mom has been able to visit four times, and Jay, my youngest, came three times. Mark, the second one, came for the first time last month. We got a picture at the wedding. I love them! We've been through a lot together. I'm very thankful for God's work in my life.

And we can see Jesus being an example in the midst of betrayal, in the middle of failure. And we're going to experience that in our lives. And we're going to choose which truths we're going to listen to — the word of God, or we're going to let outside forces misrepresent him.

So as the worship team comes up and as we close, [you're] going to have an opportunity to come up here and pray if there's a relationship you feel like the Lord is wanting you to address, to deal with. The altar's here for you to confess that to him. In fact, Matthew 5:23-24 says this: "If you are offering your gift at the altar and there remember that your brother has something against you, leave your gift there before the altar. First be reconciled to your brother, and then come and offer your gift." That's how important this is to him.

I know our church family is struggling with different hurts, and my prayer is that we can look at Jesus' example for us — and not just hear it, because I think we hear it a lot, but put it into application. Put it into application.

I want to read Psalm 34 real quick as we go into this last song: "I will bless the LORD at all times; his praise shall continually be in my mouth. My soul makes its boast in the LORD; let the humble hear and be glad. Oh, magnify the LORD with me, and let us exalt his name together! I sought the LORD, and he answered me and delivered me from all my fears. Those who look to him are radiant, and their faces shall never be ashamed."

So I pray that the Spirit will have his work in your heart and in your life.$transcript$,
      $takeaways$[
  "Sanctify your emotions instead of being ruled by them or burying them — Jesus was “troubled in his spirit” and said so, without letting the feeling drive him.",
  "Trust God's sovereignty in the hurt: Romans 8:28 is a conditional promise, and the “good” it guarantees is being conformed to the image of Christ (v. 29), not comfort, ease, or a silver lining.",
  "Be gracious to the person who wounded you — Jesus gave Judas the seat of honor rather than avoiding him or retaliating — and pray, because relational conflict has a spiritual dimension (Ephesians 6:11-18).",
  "Measure your love by “just as I have loved you”: self-sacrificing, unconditional, forgiving, and aimed at reconciling people to God. That love is how the world will know you are his disciple.",
  "When you fail, abide rather than strive — God fully knows you and still fully loves you, so remain in Christ and take his rest instead of carrying the relationship in your own strength."
]$takeaways$::jsonb,
      'https://www.youtube.com/watch?v=4Nv2leHuTZ8',
      true
    )
    returning id into v_talk_id;
  else
    update public.sermon_talks set
      event_id      = v_event_id,
      category      = 'sermon',
      speaker_name  = 'Marvin Quiambao',
      scripture_ref = 'John 13:21-38',
      summary       = $summary$Preaching from John 13:21-38 while Pastor Kevin is away on the Ecuador trip, student pastor Marvin Quiambao continues Charleston Baptist's series in the Gospel of John, reading the passage in light of John's own stated purpose in John 20:30-31. He works the text in three movements — the relationship betrayal (vv. 21-30), the relationship example (vv. 31-35), and the relationship failure (vv. 36-38) — reconstructing the low, U-shaped triclinium table so the congregation can see that Jesus handed the morsel to Judas from a seat of honor rather than distancing himself from his betrayer, and that Satan's entry follows the betrayal rather than causing it.

From each movement he draws applications and then tests them out loud against his own family. Betrayal calls for sanctifying our emotions rather than being enslaved to them or suppressing them, trusting God's sovereignty as a conditional promise whose "good" is conformity to Christ (Romans 8:28-29), being gracious toward the one who wounded us, and praying in spiritual conflict (Ephesians 6:11-18; Luke 22:31-32). Jesus' new commandment sets the measure of love at "just as I have loved you" — self-sacrificial, unconditional, forgiving, and aimed at reconciliation, and that love is how the world identifies his disciples. Peter's coming denial then shows that God fully knows us and still fully loves us, so the answer to certain failure is not more self-effort but abiding in Christ (John 15:4-5) and receiving his rest (Matthew 11:29-30). Throughout, Marvin narrates his own story: leaving home for the Navy at seventeen, his younger brothers' long-held resentment at that departure, his defensiveness when he first heard it, and the slow reconciliation that brought his mother and both brothers together at his son Sam's wedding the month before. He closes with a call to the altar from Matthew 5:23-24 and a reading of Psalm 34.$summary$,
      transcript    = $transcript$I am super excited to share the word of God with you and continue in our series in the Gospel of John. We're going to be in John chapter 13, but I do want to go back to our purpose verse in John chapter 20, verses 30 and 31. It says, "Now Jesus did many other signs in the presence of his disciples, which are not written in this book, but these are written so you may believe that Jesus is the Christ."

We just finished music camp, and it was amazing to hear the kids put the songs together, talk about Matthew, Mark, Luke and John and all the different unique aspects of the Gospels, and how they testify of the person of Jesus Christ. Each of them has a specific message that teaches us an aspect of Jesus. It's so amazing that we have four distinct accounts, and we have been going through the book of John.

I'm going to read through our entire passage. We'll be in John chapter 13, verses 21 through 38. We're going to read through the entire passage, and then we'll slow down [and see what] the Lord has for us. And I'll pray. So if you don't have a Bible, there should be one in front of you or underneath the seat you're sitting in. If you want to turn to page 997 — I mean, if you don't have a Bible, we encourage you to keep that Bible. Consider that as a gift from our church to you. We think everyone should have a Bible. I'll encourage you to write in it, highlight it, but most importantly, spend time reading it.

So I'm going to read our passage, and then I'm going to pray, and we'll get into the passage. John chapter 13, verses 21 through 38:

"After saying these things, Jesus was troubled in his spirit, and testified, 'Truly, truly, I say to you, one of you will betray me.' The disciples looked at one another, uncertain of whom he spoke. One of his disciples, whom Jesus loved, was reclining at the table at Jesus' side, so Simon Peter motioned to him to ask Jesus of whom he was speaking. So that disciple, leaning back against Jesus, said to him, 'Lord, who is it?' Jesus answered, 'It is he to whom I will give this morsel of bread when I have dipped it.' And when he had dipped the morsel, he gave it to Judas, the son of Simon Iscariot. Then after he had taken the morsel, Satan entered into him. Jesus said to him, 'What you are going to do, do quickly.' Now no one at the table knew why he said this to him. Some thought that, because Judas had the money bag, Jesus was telling him, 'Buy what we need for the feast,' or that he should give something to the poor. So, after receiving the morsel of bread, he immediately went out. And it was night.

"When he had gone out, Jesus said, 'Now is the Son of Man glorified, and God is glorified in him. If God is …' Little children, yet a little while I am with you. You will seek me, and just as I said to the Jews, so now I also say to you, "Where I am going you cannot come." A new commandment I give to you, that you love one another: just as I have loved you, you also are to love one another. By this all people will know that you are my disciples, if you have love for one another.'

"Simon Peter said to him, 'Lord, where are you going?' Jesus answered him, 'Where I am going you cannot follow me now, but you will follow afterward.' Peter said …"

So as we spend time contemplating and understanding the purpose statement — why John wrote this Gospel — and where this passage fits in light of that, we see three things. We see the relationship betrayal, the relationship example, and the relationship failure.

Before we go into it, I want to share a little bit about myself. If you guys don't know, I am the student pastor here. Pastor Kevin's away on our Ecuador trip, and [I'm carrying] our study through the Gospel of John.

As we look at these relationships that we're going through, I want to share a little bit about my own personal family dynamics and family relationships. I was born in the Philippines, but I grew up in California. I grew up in Silicon Valley, and my parents divorced when I was in middle school. My mom worked as a cashier at the military commissary — that's how we came to America. My dad joined the Navy from the Philippines, and that's how he came to America. She was a cashier, and when my parents split up my mom was raising her three boys: me and my two younger brothers.

At the age of 17 I left for the Navy after high school. I graduated, and I was going through boot camp. I've got a picture of the day we left back in '98. They were at the airport saying goodbye to me. I was 17 at the time. My second brother, Mark, was 15, and the youngest at the time was Jay, who was 12.

Within the last year my youngest brother Jay was sharing with me that Mark, my second brother, had been harboring feelings toward me of anger and resentment — angry that I left them at such an important stage of their life. My younger brother said he felt hurt and abandoned, as they had been talking amongst themselves, trying to process their own resentment towards me.

In sharing that, I instantly got defensive. I was like, "You were upset about me leaving? I left home at 17 and I went into a hostile environment that was meant to break you down."

I remember being at boot camp and celebrating my 18th birthday. Now, those guys who have gone through the military — they celebrate in a different way. My mom sent a care package and cookies, and my RDC, my recruit division commander — similar to a drill sergeant — got the package and was going through it. He's like, "Oh, it's your birthday today. All right, for your birthday we're going to do push-ups." So the whole division got in push-up position. My mom's thinking it's like a nice little treat, and they're eating my cookies while I was doing push-ups with the whole division, right? That's the gift that I got — to work out.

I also remember being up at 2:00 in the morning. After a long day of working out, running drills, classes, we would have to stand watch within the barracks, and we would have to rove around to make sure nobody came in and did anything. And if you fell asleep you would get what's called a MOD — an assignment memorandum — which would push you back to start boot camp all over again. So you didn't want to do that. But it was 2:00 in the morning and I was exhausted, and I remember thinking to myself, "Lord, what am I doing? This is crazy. Why am I here?"

So those feelings of anger and resentment that my brothers were sharing — while I remembered going through my own feelings at that time, you know, I was upset that they were saying they were upset with me when I was going through some hard times at the time too. But they said they're still trying to process their hurt. And I know that most of you have stories similar — a similar story.

Jesus is going to give us an example. Again, the three points that we're going to go through are in there too. Again, have your Bible, because we're going to spend time reading it slowly. We're going to ask the Lord to guide us in his Holy Spirit. Let's pray. We'll ask him to do that.

Dear Heavenly Father, Lord, we are thankful for your word. We are thankful that John was faithful to record the things that have taken place, that your Holy Spirit has guided him in putting this together. So Lord, as we look and reflect, Lord, I pray that I step to the side and that your word can be the teacher. Lord, I pray that your Spirit can teach us how we can apply it — that your Spirit not just will help us take it into our ears, but put it into action in our lives. And so Lord, as we spend time in here, may you be glorified. In Jesus' name, amen.

All right, so turn to John 13, verse 21: "After saying these things, Jesus was troubled in his spirit."

So John is using a narrative technique here, a technique that's going to take us on a journey. And right off from the beginning we see a conflict occur. Somebody is going to betray Jesus, and the disciples weren't sure who it was.

Now let's put this back in context. If you don't know — a lot of times when we think of the Lord's Supper, we think of Leonardo da Vinci's painting, of everyone kind of sitting in a row and Jesus is in the middle. But that's not likely what it was like. Pastor Kevin shared a picture: this U-shape arrangement was very common. It's called a triclinium. They'd sit low, and as they sat and ate, the diners would recline on their left arm and use their right hand to eat.

It was often positioned in a strict social hierarchy. Where they sat mattered, because it said a lot about their social status. The two most honored guests sat immediately beside the host — the person on the right and the left. This could be why they were arguing about who was greatest in the kingdom.

Last week Pastor Kevin shared: starting from the left would have been John, the trusted friend. Some say that the youngest celebrant would be positioned near the host, so that's a common thing. On the [other] side of John would have been Peter, who took the role of a servant — easy to get access to things, easy to get up and take care of things when they came up. So just keep that in mind as we continue to go through this story. Go back to John: right next to John would have been the host of the event, so that's where Jesus was sitting. And then next to Jesus, on the left, is where Judas was sitting — the position of the honored guest.

Let's continue reading. Now you've got the picture in your mind; let's continue to read verse 23: "One of his disciples, whom Jesus loved, was reclining at the table at Jesus' side, so Peter motioned to him to ask Jesus of whom he was speaking."

So if you can imagine, as Jesus is talking about someone betraying him, Peter's probably like, "Hey, John, ask Jesus who he's talking about." So Peter is over there [signaling] John, and John is already close — he just needs to lean a little bit.

Now let's get into verse 25 — "when he had dipped the morsel, [he gave it] to Judas, the son of Simon Iscariot." So in that seating arrangement, eating was a very intimate thing. Those days — it is today, too — they would have food at the table and they would pass it along and share it. When they grabbed bread they would have grabbed from the same loaf, and in fact sometimes if they would dip their food, they would dip it from the [same] plate, and they wouldn't care about double dipping, right? That was the culture. That was the intimacy that was taking place. And so for Jesus to do this would not have been strange at the time. And it is the point of the story that John is bringing us to — a climax. The betrayer is revealed.

Verse 27: "Then after he had taken the morsel, Satan entered into him." So here we see Jesus is letting us know Satan is involved in this transaction.

Verses 28 and 29: "Now no one at the table knew why he said this to him. Some thought that, because Judas had the money bag, Jesus was telling him, 'Buy what we need for the feast,' or that he should give something to the poor." So the rest of the disciples didn't get the interaction between Jesus and John. They just heard Jesus' comment to Judas and were trying to figure out the context. And if you're unfamiliar with Judas' role among the disciples, he was responsible for the money. Throughout the Gospels we see Judas carrying that role, and we see glimpses of his responsibility in that.

Verse 30: "So after receiving the morsel of bread, he immediately went out. And it was night." So here we have the resolution of this particular story, and we see the betrayer revealed.

Now, I think a lot of us are super familiar with the overall view of the story, but I think it's important for us to slow down, like I shared earlier, and just take time to ask the Spirit what he's trying to teach us in light of this. And so, as we go into the different portions, I put together some application that we can take away and apply into our lives.

So what we see here is Jesus being betrayed. Let's look at that and see how we can apply what we have read into our life.

At the beginning we see Jesus sanctify his emotions. He has emotions. In verse 21 it says, "After saying these things Jesus was troubled in his spirit." He's troubled. So we can see that Jesus was upset — he had emotions.

Now, all of us are going to fall somewhere in this spectrum. We are either going to be slaves to our emotion, where everything we feel, everybody is going to know about it, and I'm going to respond to how I feel — or you're just going to deal with it. Or we're going to be on this side of the spectrum where we're going to suppress our emotion. We're going to be like, "Nobody's going to know what I'm doing. I shouldn't feel this way." And it's just going to stay inside, and you're going to boil up and boil over.

But what we're called to do is sit in the middle and sanctify our emotion. It's okay for us to have emotions, but we need to make sure our emotions are shaped by the word of God. So we don't want to be slaves to it, we don't want to suppress it — you want to sanctify it.

And so Jesus, he was upset. He shared that. In verse 21 it says, "After saying these things." It's important for us to realize, when we see passages like that, this is a passage within the context of something. So what was it that he just said? If you don't remember, I'm just going to give us a quick snapshot of what was taking place there.

So Jesus knew Judas was going to betray him, but despite that he trusted God in his sovereign plan. So the next application we have is: we need to trust in God's sovereignty.

Now there are scriptures that talk about his sovereignty, and one of them I like to go back to is Romans 8:28. It says, "And we know that for those who love God all things work together for the good, for those who are called according to his purpose."

Now, this doesn't mean that everything that happens is good, or that there's a silver lining in everything. It's actually a conditional promise — it's for those who love God and those that are called according to his purpose. So it's not for everyone. But what it does mean is nothing enters a believer's life without passing through God's loving filter. He is in total control and can bring profound redemptive value out of deep suffering. All things [work] together for the good.

That good is described in verse 29 of Romans 8. So the good in verse 28 is not our comfort, not our ease — it's to conform us to the image of Jesus. And so if we understand and recognize that things that happen around us are for our good, to conform us to Jesus, we can trust in God's sovereignty.

Now the next application I think we can take in regard to this betrayal is to be gracious — in a seat of honor. Rather than distancing himself from his betrayer, Jesus positioned Judas in a place of honor. Now just think about ourselves: how do we respond when someone's betrayed us? We either want to avoid them, or we want to figure out how to get back at them, right? The last thing we want is to put them in a [place of honor]. He put that person in a place of honor. So we need to be gracious.

The last application from this section is to pray — pray in the midst of spiritual warfare. In verse 27 it says, "Then after taking the morsel, Satan entered into him." So Jesus is pulling back the curtain, showing us there are spiritual forces in our world today, especially in conflict.

Ephesians 6:11-12 says, "Put on the whole armor of God, that you may be able to stand against the schemes of the devil. For we do not wrestle against flesh and blood, but against the rulers, against the authorities …" Paul goes on to talk about putting on the armor of God and what that looks like. And at the very end of it, in verse 18, he encourages them to pray. It says, "Praying at all times in the Spirit, with all prayer and supplication. To that end, keep alert with all perseverance, making supplication for all the saints."

Especially in conflict, there are many voices trying to give us direction, telling us where to go, how to resolve certain things. And if we're not careful we start to ignore the truths of God, and we start to listen to the lies of Satan. And when Satan gets a foothold, we start acting out of character. We can almost come across as [someone else] in this.

In fact, Jesus even prayed for Simon Peter against the work of Satan. Luke 22:31-32: "Simon, Simon, behold, Satan demanded to have you, that he might sift you like wheat, but I have prayed for you that your faith may not fail. And when you have turned again, strengthen your brothers."

Those are a couple of applications we can have when we see the betrayal that Jesus is experiencing.

The next portion we're going to look into is the relationship example. Verse 31: "When he had gone out, Jesus said, 'Now is the Son of Man glorified, and God is glorified in him. If God is …'"

So we see a shift in the scene. Jesus has gone out — but what and why is he talking about being glorified? What's going on here?

Pastor Kevin has highlighted the shift from Jesus' public ministry to private ministry taking place in chapter 12. And as we've been reading throughout the whole Gospel of John, there have been miracles that have been highlighted to kind of fulfill the purpose statement of John — that we may know that Jesus is the Son of God and have life through him. But throughout those narratives there's a phrase that comes up often. It says that "my hour has not yet arrived." So I encourage you — we're going to go through these kind of in rapid succession, but if you're writing them down, spend time reading them in context to understand. This is important before we get into our passage. So John 2:4, John 7:30, John 8:20 — those are prior to John 12.

Now we're going into John 12:23-24. It says, "And Jesus answered them, 'The hour has come for the Son of Man to be glorified. Truly, truly, I say to you, unless a grain of wheat falls into the earth and dies, it remains alone, but if it dies, it bears much fruit.'" John 12:27. Now in the beginning of our chapter 13 it says [the same thing].

So the glorification Jesus is talking about — that's what we're talking about — is going to happen on the cross. Jesus is talking about his crucifixion. It's going to be the hour, the glorious hour, the glorification that's going to happen. So it's important to understand that when we get into verses 33 through 35. It says, "and just as I said to the Jews, so now I say it to you, 'Where I am going you cannot come.' A new commandment I give to you, that you love one another: just as I have loved you, you also are to love one another. By this all people will know that you are my disciples, if you have love for one another."

So is loving each other a new commandment? I mean, if you look at the Ten Commandments, the first four are how we're supposed to love God, and the last six are how we're supposed to love one another. And it also talks about loving your neighbor in the Levitical laws. If you look at Leviticus 19:18, it says, "You shall not take vengeance or bear a grudge against the sons of your own people, but you shall love your neighbor as yourself." Leviticus 19:34 says, "You shall treat the stranger who sojourns with you as the native among you, and you shall love him as yourself, for you were strangers in the land of Egypt. I am the LORD your God."

So just in this small passage, what are some applications? What are some differences between [how] the scriptures teach us to love others in the Old Testament versus Jesus saying "I'm giving you a new commandment" here in the New Testament?

What is the context of the passages in Exodus and Leviticus? The law was for the people of God to learn how to conduct themselves — in their city laws. They were meant to be a people who represented God to the world.

Now what's the context with Jesus in this passage? Let's look at what he was going to do, because he talked about being glorified. What was his reason for going to the cross? Jesus is restoring the nations to their Creator. He loved people to restore their relationship with God. The context of this new type of love that Jesus is talking about is in the context of an agape love.

Let me ask you this: how would you describe Jesus' love for us? How would [you describe] the new commandment Jesus is giving to his disciples?

And so what are the applications for our relationship example? Jesus loved with self-sacrifice. John 15:13 says, "Greater love has no one than this, that someone lay down his life for his friends." So he wants us to love in that type of manner.

Jesus loved unconditionally. Romans 5:8: "But God shows his love for us in that while we were still sinners, Christ died for us." Paul is writing to a church in Corinth about how they're supposed to love each other, because they're failing at it, and this is how he describes it — 1 Corinthians 13:4-7: "Love is patient and kind; love does not envy or boast; it is not arrogant or rude. It does not insist on its own way; it is [not] irritable or resentful; it does [not] rejoice at wrongdoing, but rejoices with the truth. Love bears all things, believes all things, hopes all things …" We're supposed to love unconditionally.

Jesus' love also forgave others. Luke 23:34 — Jesus' love is to forgive others, and we should reflect that. Luke 23:34: "And Jesus said, 'Father, forgive them, for they know not what they do.' And they cast lots to divide his garments." So we're supposed to be loving to forgive others also.

The last one: Jesus loved to reconcile us to God. Jesus died on the cross to reconcile [us].

Now can you imagine what our relationships would be like if we loved each other the way that Christ loved us? And he said that is how the people — that's how the world is going to know you're my people. This type of love. That love would be so radical that it'd be hard not to take notice of it. [With] people struggling with, you know, the social struggles, things like that — if they were to come to see a place where the people of God loved each other in the way that Christ loved us, by going on the cross… That's what Jesus is saying: "I'm about to be glorified. Take note of that. Love each other that way. That's how they're going to know you're my disciples."

And so, that's a hard call. For us to love like that can almost seem overwhelming. Like, somebody betrays me and I'm supposed to love [them]? I don't know if I could do that. And I think a lot of us can understand that tension. And that's what brings us into our final section: the relationship failure.

John 13:36-37. John 7:33 — so he says it there. And in John 8:21 he said to them [the same]. Again, read the context of these verses. The Jews, when Jesus was telling them, didn't understand, and Jesus had to explain over and over again. But here in our particular passage, Peter still does not understand.

Now, despite not understanding, Peter has heart, and he's willing to lay down his life for Jesus. So I think Peter becomes relatable because of that. A lot of times we don't understand things — Peter just jumps all in. We can understand and relate to that. But here we see that he's telling Jesus, "I'm willing to die for you."

Now this next verse is something beautiful that will take place. Verse 38 — Jesus answered [him, "Will you lay down your life for me? Truly, truly, I say to you, the rooster will not crow till you have denied me three times."]

So where's the beauty in that? The beauty is that Jesus knows. He knows our failures. He knew Peter's failure, and he still loved him. Jesus knows our failure and still loves us, right?

So where's the application in this small set of verses? The first thing we need to recognize is: we're going to fail. We will fail — especially when we're like Peter and try to do things in our own strength. Try to live the Christian life in your own strength; you're going to be exhausted, and you're going to fail over and over and over again.

But what's beautiful is that God fully knows us, but he still fully loves us. Now think about that. That is something we all desire in our relationships around us. We want to be fully known by the other person or the other people, and we wonder if they would fully love us. We want to be fully loved, but we're scared, because we know if we let them know some of these dark parts of us they might reject us. So to be fully known but not fully loved — that's our deepest fear. But to be fully loved but not fully known is too shallow for us to want to stay there. So in this passage we see that God fully knows and still fully loves us. That's a beautiful thing. That's a beautiful thing.

Romans 3:23: "For all have sinned and fall short of the glory of God." So God knows that we have sinned, we're going to fall short — and if you continue reading, again, this within its context, it is amazing. So it's to help us to recognize that we will fail. And just like Peter did — he did fail.

So what are we supposed to do when we know we're supposed to fail? Jesus is going to go into this more in John 15, but we should abide. Abide. What does that mean? I don't know if you use that word as much in our normal language, but it's very common in the book of John, and the Greek word is menō. Menō. And it literally means to remain in a place with somebody — just spend time with someone. This word is one of my favorite words.

Listen to what Jesus says about abiding in John 15. We actually sang about it with our music camp. It says, "Abide in me, and I in you. As the branch cannot bear fruit by itself unless it abides in the vine, neither can you unless you abide in me. I am the vine [you are the branches. Whoever abides in me and I in him, he it is that bears much fruit, for apart from me you can do nothing.]"

Those are strong words. Like — you can do nothing apart from Jesus. We are supposed to spend time with Jesus and abide in him, because apart from him we can [do nothing].

[The application] for this portion is that we're to rest. There's no point in stressing about things we have very little control over. We are to work side by side with Jesus, and when we abide in him he offers us rest. Matthew 11:29-30 says, "Take my yoke upon you, and learn from me, for I am gentle and lowly [in heart, and you will find rest for your souls. For my yoke is easy, and my burden is light.]" Jesus calls the people to come and find rest — not to be called to carry the heavy burdens of religious legalism. Jesus is restoring the rest that was meant to take place in the creation narrative. The seventh day of creation was meant for eternity.

Now let's put this all together. Let's think about the different relationship challenges that we have been through. Let's ask the Holy Spirit to teach us and make this personal. Think about a relationship struggle that you're having right now. Think about a betrayal that might have happened in the past. We will have relationships, and relationship betrayals. We will. Jesus did.

Let's pick one of the applications and think it through. Could you sanctify your emotions? Well, as my brothers were sharing — as my younger brother was sharing what they were processing — I wanted to lash back out at them: "You're not the only one who was scared, alone, angry, frustrated." But the Lord told me to be quiet. He said, "Wait. Wait to speak." So I did.

Did I trust in God's sovereignty? Was me leaving at the time that I did part of God's plan? Did God use that to bring good in my life, and also to grow my brothers? Yes. I could trust in that — in God's sovereignty.

Could I be gracious? I didn't realize the role that I played in my younger brothers' lives. When my parents divorced, I stepped into the father role and male role model for them. And after going through that early on in life, to again have it repeated at age 15 and at age 12 — I didn't realize the hurt that it was causing them. So I needed to be gracious. I pray with them often for healing. We pray for the gratitude that the Lord has worked out in our lives.

And so, as you think about your relationship betrayals, what is the Holy Spirit teaching you to apply? As we look at Jesus' example on the cross, are we following that example? Do we love with self-sacrifice? Do we love unconditionally? Do we love so that we can forgive others? Do we love so people can be reconciled to God? God's love in our lives allows us to work through the hurt we experience.

And then what happens when we fail? Do we acknowledge our failure? Do you abide? Do you rest? To be honest, this is probably the area I struggle most — you can ask my family. I struggle at letting them know when I mess up. I am a go-go-go person; I don't like to sit still. So when the Lord is telling me to do that, it takes a lot for me to listen. But the Lord's working that out in me. He's teaching me through his word. And I'm praying that as I continue to work this out with my family, God can get the glory in the midst of it.

Just this last month my son Sam got married, and my mom and two brothers were able to come for the wedding. And this was in the last 28 years that I've been out of the home, in the military. And here in Charleston, my mom has been able to visit four times, and Jay, my youngest, came three times. Mark, the second one, came for the first time last month. We got a picture at the wedding. I love them! We've been through a lot together. I'm very thankful for God's work in my life.

And we can see Jesus being an example in the midst of betrayal, in the middle of failure. And we're going to experience that in our lives. And we're going to choose which truths we're going to listen to — the word of God, or we're going to let outside forces misrepresent him.

So as the worship team comes up and as we close, [you're] going to have an opportunity to come up here and pray if there's a relationship you feel like the Lord is wanting you to address, to deal with. The altar's here for you to confess that to him. In fact, Matthew 5:23-24 says this: "If you are offering your gift at the altar and there remember that your brother has something against you, leave your gift there before the altar. First be reconciled to your brother, and then come and offer your gift." That's how important this is to him.

I know our church family is struggling with different hurts, and my prayer is that we can look at Jesus' example for us — and not just hear it, because I think we hear it a lot, but put it into application. Put it into application.

I want to read Psalm 34 real quick as we go into this last song: "I will bless the LORD at all times; his praise shall continually be in my mouth. My soul makes its boast in the LORD; let the humble hear and be glad. Oh, magnify the LORD with me, and let us exalt his name together! I sought the LORD, and he answered me and delivered me from all my fears. Those who look to him are radiant, and their faces shall never be ashamed."

So I pray that the Spirit will have his work in your heart and in your life.$transcript$,
      key_takeaways = $takeaways$[
  "Sanctify your emotions instead of being ruled by them or burying them — Jesus was “troubled in his spirit” and said so, without letting the feeling drive him.",
  "Trust God's sovereignty in the hurt: Romans 8:28 is a conditional promise, and the “good” it guarantees is being conformed to the image of Christ (v. 29), not comfort, ease, or a silver lining.",
  "Be gracious to the person who wounded you — Jesus gave Judas the seat of honor rather than avoiding him or retaliating — and pray, because relational conflict has a spiritual dimension (Ephesians 6:11-18).",
  "Measure your love by “just as I have loved you”: self-sacrificing, unconditional, forgiving, and aimed at reconciling people to God. That love is how the world will know you are his disciple.",
  "When you fail, abide rather than strive — God fully knows you and still fully loves you, so remain in Christ and take his rest instead of carrying the relationship in your own strength."
]$takeaways$::jsonb,
      video_url     = 'https://www.youtube.com/watch?v=4Nv2leHuTZ8',
      is_published  = true,
      updated_at    = now()
    where id = v_talk_id;
  end if;

  -- ── 3. Berean review (berean-v4) ──────────────────────────────────────────
  -- Verdicts are keyed to card ids, so a replaced report invalidates them.
  delete from public.sermon_talk_berean_verdicts
  where analysis_id in (select id from public.sermon_talk_berean where talk_id = v_talk_id);

  insert into public.sermon_talk_berean (talk_id, organization_id, report, model, prompt_version)
  values (
    v_talk_id,
    v_org_id,
    $report${
  "promptVersion": "berean-v4",
  "model": "agent:sermon-berean-review",
  "extractModel": "agent:sermon-berean-review",
  "illustrationModel": "agent:sermon-berean-review",
  "summary": {
    "thesis": "Because Jesus met betrayal without being ruled by it, gave a new commandment to love as he loved, and knew Peter’s failure in advance yet kept loving him, his disciples can sanctify their emotions, trust God’s sovereignty, be gracious to those who wound them, pray in spiritual conflict, love sacrificially, and abide in him when they fail.",
    "mainReference": "John 13:21-38",
    "stats": {
      "total": 30,
      "verbatim": 23,
      "paraphrase": 1,
      "allusion": 4,
      "uncited": 2,
      "illustrations": 9,
      "flagged": 1
    },
    "truncated": false
  },
  "maturity": {
    "overall": 4,
    "overallNote": "A solid-food message that stays anchored to one passage while doing real biblical-theological work across the Gospel of John. Its strongest dimension is application: the speaker exposes his own family fracture in specific, costly detail and then walks his own four applications back through it out loud. Its softest edge is pace — roughly thirty citations across eleven books move quickly, and a few historical and theological claims (the triclinium seating chart, the Decalogue division, the creation Sabbath) are asserted as settled fact without the supporting argument a hearer would need to check them.",
    "dimensions": [
      {
        "key": "doctrinalContent",
        "label": "Doctrinal Content",
        "score": 4,
        "note": "Substantial doctrinal ground is covered and mostly handled with care: divine sovereignty with explicit guardrails against the \"silver lining\" misreading, the cross as glorification, agape as the measure of the new commandment, the universality of sin, union with Christ, and Sabbath rest. The atonement is framed almost entirely as reconciliation and restored relationship; substitution and forgiveness of sin are present in the quoted texts (Romans 5:8, Luke 23:34) but not developed.",
        "evidence": [
          "nothing enters a believer’s life without passing through God’s loving filter. He is in total control and can bring profound redemptive value out of deep suffering.",
          "So the good in verse 28 is not our comfort, not our ease — it’s to conform us to the image of Jesus.",
          "Jesus is restoring the nations to their Creator. He loved people to restore their relationship with God."
        ]
      },
      {
        "key": "scriptureHandling",
        "label": "Handling of Scripture",
        "score": 4,
        "note": "Genuinely expositional. The full passage is read before interpretation, the exposition moves verse by verse, and context is repeatedly insisted on (\"this is a passage within the context of something,\" \"read the context of these verses\"). The \"hour has not yet come\" thread is traced properly through John. Marks come off for asserting the triclinium seating arrangement and the 4/6 Decalogue division as plain fact, and for one internal inconsistency in the seating description — John and Judas are both placed on Jesus’ left.",
        "evidence": [
          "It’s important for us to realize, when we see passages like that, this is a passage within the context of something. So what was it that he just said?",
          "Now, this doesn’t mean that everything that happens is good, or that there’s a silver lining in everything. It’s actually a conditional promise",
          "if you’re writing them down, spend time reading them in context to understand"
        ]
      },
      {
        "key": "assumedLiteracy",
        "label": "Assumed Biblical Literacy",
        "score": 3,
        "note": "Actively hospitable to newcomers: pew Bibles and a page number are offered, Bibles are given away, and technical terms are explained rather than assumed — triclinium, agape, and the Greek menō are each defined. Against that, the message moves through roughly thirty citations in eleven books, and several are given as bare chapter-and-verse in rapid succession (\"John 2:4, John 7:30, John 8:20\") with an acknowledgement that hearers will need to read them later on their own.",
        "evidence": [
          "I don’t know if you use that word as much in our normal language, but it’s very common in the book of John, and the Greek word is menō.",
          "if you don’t have a Bible, there should be one in front of you or underneath the seat you’re sitting in",
          "So John 2:4, John 7:30, John 8:20 — those are prior to John 12."
        ]
      },
      {
        "key": "applicationDepth",
        "label": "Application Depth",
        "score": 5,
        "note": "Exceptional. Each application is named, grounded in a text, and then tested against a real situation the speaker is still in the middle of — his brothers’ resentment at his leaving home at seventeen, his own defensiveness, his admission that he stepped into a father role he did not know he was vacating. He names where he is still failing (\"this is probably the area I struggle most — you can ask my family\") rather than presenting a resolved story, and closes with a specific, actionable call to reconciliation at the altar.",
        "evidence": [
          "I wanted to lash back out at them: \"You’re not the only one who was scared, alone, angry, frustrated.\" But the Lord told me to be quiet.",
          "I didn’t realize the role that I played in my younger brothers’ lives.",
          "To be honest, this is probably the area I struggle most — you can ask my family. I struggle at letting them know when I mess up."
        ]
      }
    ]
  },
  "cards": [
    {
      "id": "c1",
      "transcriptQuote": "Now Jesus did many other signs in the presence of his disciples, which are not written in this book, but these are written so you may believe that Jesus is the Christ.",
      "usageType": "verbatim",
      "claimSummary": "John's stated purpose for writing the Gospel is the frame for reading chapter 13.",
      "reference": "John 20:30-31",
      "passageReference": "John 20:28-31",
      "passageText": "[28] Thomas answered him, “My Lord and my God!” [29] Jesus said to him, “Because you have seen me, you have believed. Blessed are those who have not seen, and have believed.” [30] Therefore Jesus did many other signs in the presence of his disciples, which are not written in this book; [31] but these are written, that you may believe that Jesus is the Christ, the Son of God, and that believing you may have life in his name.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.96,
      "assessment": "aligned",
      "explanation": "The quotation tracks the verse accurately and the use is exactly what the verse claims for itself — a stated purpose for the whole Gospel. Note that the speaker stops mid-sentence: the verse continues \"the Son of God, and that by believing you may have life in his name,\" which is the clause that carries the promise of life. The sermon later supplies that missing half (\"that we may know that Jesus is the Son of God and have life through him\"), so nothing is lost overall.",
      "confidence": "high"
    },
    {
      "id": "c2",
      "transcriptQuote": "After saying these things, Jesus was troubled in his spirit, and testified, \"Truly, truly, I say to you, one of you will betray me.\"",
      "usageType": "verbatim",
      "claimSummary": "The full passage is read aloud; Jesus announces his betrayal and identifies the betrayer.",
      "reference": "John 13:21-30",
      "passageReference": "John 13:19-32",
      "passageText": "[19] From now on, I tell you before it happens, that when it happens, you may believe that I am he. [20] Most certainly I tell you, he who receives whomever I send, receives me; and he who receives me, receives him who sent me.” [21] When Jesus had said this, he was troubled in spirit, and testified, “Most certainly I tell you that one of you will betray me.” [22] The disciples looked at one another, perplexed about whom he spoke. [23] One of his disciples, whom Jesus loved, was at the table, leaning against Jesus’ breast. [24] Simon Peter therefore beckoned to him, and said to him, “Tell us who it is of whom he speaks.” [25] He, leaning back, as he was, on Jesus’ breast, asked him, “Lord, who is it?” [26] Jesus therefore answered, “It is he to whom I will give this piece of bread when I have dipped it.” So when he had dipped the piece of bread, he gave it to Judas, the son of Simon Iscariot. [27] After the piece of bread, then Satan entered into him. Then Jesus said to him, “What you do, do quickly.” [28] Now nobody at the table knew why he said this to him. [29] For some thought, because Judas had the money box, that Jesus said to him, “Buy what things we need for the feast,” or that he should give something to the poor. [30] Therefore having received that morsel, he went out immediately. It was night. [31] When he had gone out, Jesus said, “Now the Son of Man has been glorified, and God has been glorified in him. [32] If God has been glorified in him, God will also glorify him in himself, and he will glorify him immediately.",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c2-i1",
          "excerpt": "Within the last year my youngest brother Jay was sharing with me that Mark, my second brother, had been harboring feelings toward me of anger and resentment — angry that I left them at such an important stage of their life.",
          "kind": "personal-experience",
          "claimSupported": "Betrayal and relational rupture are normal to human relationships, as they were to Jesus.",
          "alignment": "applies-text",
          "explanation": "A well-matched entry point. It does not claim the brothers betrayed him or equate the situation with Judas — it establishes the relational hurt the passage will be applied to, and the speaker keeps himself in the role of the one who caused pain rather than the wronged party.",
          "confidence": "high"
        },
        {
          "id": "c2-i2",
          "excerpt": "We are either going to be slaves to our emotion, where everything we feel, everybody is going to know about it, and I’m going to respond to how I feel — or you’re just going to deal with it.",
          "kind": "analogy",
          "claimSupported": "Jesus was \"troubled in his spirit\" without being ruled by or suppressing the emotion.",
          "alignment": "clarifies-text",
          "explanation": "The spectrum image usefully makes room for the observation that Jesus felt and expressed trouble. The middle term \"sanctify\" is the speaker’s framing rather than a category drawn from this verse, but he immediately anchors it to emotions \"shaped by the word of God,\" which keeps it from floating free.",
          "confidence": "medium"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": 0.58,
      "assessment": "aligned",
      "explanation": "The passage is read in full and in order before any interpretation is offered, and the reading matches the text. Reading the whole unit first, then returning to work through it verse by verse, is a sound handling pattern — the hearer can check the preacher against the text in front of them. The lower text-match percentage on this card reflects a translation difference, not a misquotation: the speaker is reading the ESV (\"Truly, truly, I say to you\") while the card is grounded in the public-domain WEB text (\"Most certainly I tell you\").",
      "confidence": "high"
    },
    {
      "id": "c3",
      "transcriptQuote": "A new commandment I give to you, that you love one another: just as I have loved you, you also are to love one another. By this all people will know that you are my disciples, if you have love for one another.",
      "usageType": "verbatim",
      "claimSummary": "After Judas leaves, Jesus speaks of glorification and gives the new commandment to love.",
      "reference": "John 13:31-35",
      "passageReference": "John 13:29-37",
      "passageText": "[29] For some thought, because Judas had the money box, that Jesus said to him, “Buy what things we need for the feast,” or that he should give something to the poor. [30] Therefore having received that morsel, he went out immediately. It was night. [31] When he had gone out, Jesus said, “Now the Son of Man has been glorified, and God has been glorified in him. [32] If God has been glorified in him, God will also glorify him in himself, and he will glorify him immediately. [33] Little children, I will be with you a little while longer. You will seek me, and as I said to the Jews, ‘Where I am going, you can’t come,’ so now I tell you. [34] A new commandment I give to you, that you love one another. Just as I have loved you, you also love one another. [35] By this everyone will know that you are my disciples, if you have love for one another.” [36] Simon Peter said to him, “Lord, where are you going?” Jesus answered, “Where I am going, you can’t follow now, but you will follow afterwards.” [37] Peter said to him, “Lord, why can’t I follow you now? I will lay down my life for you.”",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.91,
      "assessment": "aligned",
      "explanation": "Accurately read. The sermon’s central move — that the \"new\" in the new commandment is the measure \"just as I have loved you\" rather than the object \"one another\" — is precisely what verse 34 says, and is confirmed by the sermon’s own comparison with Leviticus 19:18.",
      "confidence": "high"
    },
    {
      "id": "c4",
      "transcriptQuote": "Simon Peter said to him, \"Lord, where are you going?\" Jesus answered him, \"Where I am going you cannot follow me now, but you will follow afterward.\"",
      "usageType": "verbatim",
      "claimSummary": "Peter's question and pledge set up Jesus' prediction of his denial.",
      "reference": "John 13:36-38",
      "passageReference": "John 13:34-38",
      "passageText": "[34] A new commandment I give to you, that you love one another. Just as I have loved you, you also love one another. [35] By this everyone will know that you are my disciples, if you have love for one another.” [36] Simon Peter said to him, “Lord, where are you going?” Jesus answered, “Where I am going, you can’t follow now, but you will follow afterwards.” [37] Peter said to him, “Lord, why can’t I follow you now? I will lay down my life for you.” [38] Jesus answered him, “Will you lay down your life for me? Most certainly I tell you, the rooster won’t crow until you have denied me three times.",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c4-i1",
          "excerpt": "We want to be fully loved, but we’re scared, because we know if we let them know some of these dark parts of us they might reject us. So to be fully known but not fully loved — that’s our deepest fear.",
          "kind": "illustration",
          "claimSupported": "Jesus fully knew Peter’s coming failure and still fully loved him.",
          "alignment": "applies-text",
          "explanation": "A strong and well-placed application of verse 38. The known/loved framing is a widely used formulation in Christian writing rather than something drawn from the text, but it names exactly what the passage shows: Jesus states the denial in advance and keeps Peter anyway (\"you will follow afterward\").",
          "confidence": "high"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": 0.87,
      "assessment": "aligned",
      "explanation": "Accurately read. The speaker’s reading of the exchange — that Peter does not understand yet is sincere, and that Jesus predicts the denial while still keeping him (\"you will follow afterward\") — is well grounded in verses 36-38.",
      "confidence": "high"
    },
    {
      "id": "c5",
      "transcriptQuote": "This could be why they were arguing about who was greatest in the kingdom.",
      "usageType": "allusion",
      "claimSummary": "The honour-ranked seating at the meal may explain the disciples’ dispute over greatness.",
      "reference": "Luke 22:24",
      "passageReference": "Luke 22:22-26",
      "passageText": "[22] The Son of Man indeed goes, as it has been determined, but woe to that man through whom he is betrayed!” [23] They began to question among themselves, which of them it was who would do this thing. [24] A dispute also arose among them, which of them was considered to be greatest. [25] He said to them, “The kings of the nations lord it over them, and those who have authority over them are called ‘benefactors.’ [26] But not so with you. But one who is the greater among you, let him become as the younger, and one who is governing, as one who serves.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "aligned",
      "explanation": "Luke 22:24 does record a dispute \"among them, which of them was considered to be greatest\" at this same supper, so the reference is real and correctly placed. The link to the seating chart is an inference, but the speaker hedges it appropriately (\"this could be why\") rather than asserting it.",
      "confidence": "medium"
    },
    {
      "id": "c6",
      "transcriptQuote": "when he had dipped the morsel, [he gave it] to Judas, the son of Simon Iscariot",
      "usageType": "paraphrase",
      "claimSummary": "Sharing a dipped morsel was an ordinary act of table intimacy, not an obvious accusation.",
      "reference": "John 13:26",
      "passageReference": "John 13:24-28",
      "passageText": "[24] Simon Peter therefore beckoned to him, and said to him, “Tell us who it is of whom he speaks.” [25] He, leaning back, as he was, on Jesus’ breast, asked him, “Lord, who is it?” [26] Jesus therefore answered, “It is he to whom I will give this piece of bread when I have dipped it.” So when he had dipped the piece of bread, he gave it to Judas, the son of Simon Iscariot. [27] After the piece of bread, then Satan entered into him. Then Jesus said to him, “What you do, do quickly.” [28] Now nobody at the table knew why he said this to him.",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c6-i1",
          "excerpt": "a lot of times when we think of the Lord’s Supper, we think of Leonardo da Vinci’s painting, of everyone kind of sitting in a row and Jesus is in the middle. But that’s not likely what it was like.",
          "kind": "cultural-example",
          "claimSupported": "The seating at the meal was a low U-shaped triclinium, not a modern row of chairs.",
          "alignment": "clarifies-text",
          "explanation": "Correcting the da Vinci image is genuinely clarifying and explains how John could be \"leaning back against Jesus\" and how Jesus could hand Judas bread unnoticed. Note for review: the reconstruction that places Judas specifically in the honoured seat is a plausible historical inference, not something John states, and it is asserted here as fact — and the description places both John and Judas on Jesus’ left.",
          "confidence": "high"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "aligned",
      "explanation": "The paraphrase is faithful to verse 26. The accompanying cultural point — that a shared dipped morsel was ordinary table intimacy, so the gesture would not have read as a public accusation — fits the narrative, which explicitly says in verses 28-29 that nobody at the table understood what had happened.",
      "confidence": "high"
    },
    {
      "id": "c7",
      "transcriptQuote": "Then after he had taken the morsel, Satan entered into him.",
      "usageType": "verbatim",
      "claimSummary": "Jesus pulls back the curtain to show a spiritual agent at work in the betrayal.",
      "reference": "John 13:27",
      "passageReference": "John 13:25-29",
      "passageText": "[25] He, leaning back, as he was, on Jesus’ breast, asked him, “Lord, who is it?” [26] Jesus therefore answered, “It is he to whom I will give this piece of bread when I have dipped it.” So when he had dipped the piece of bread, he gave it to Judas, the son of Simon Iscariot. [27] After the piece of bread, then Satan entered into him. Then Jesus said to him, “What you do, do quickly.” [28] Now nobody at the table knew why he said this to him. [29] For some thought, because Judas had the money box, that Jesus said to him, “Buy what things we need for the feast,” or that he should give something to the poor.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.6,
      "assessment": "aligned",
      "explanation": "Quoted accurately, including the sequence: the text places Satan’s entry after Judas receives the morsel, and the sermon preserves that order rather than making the bread itself the cause. The application — that conflict has an unseen dimension — is a fair reading of why John records the detail.",
      "confidence": "high"
    },
    {
      "id": "c8",
      "transcriptQuote": "Now no one at the table knew why he said this to him. Some thought that, because Judas had the money bag, Jesus was telling him, \"Buy what we need for the feast,\" or that he should give something to the poor.",
      "usageType": "verbatim",
      "claimSummary": "The other disciples missed the exchange; Judas held the money bag.",
      "reference": "John 13:28-29",
      "passageReference": "John 13:26-31",
      "passageText": "[26] Jesus therefore answered, “It is he to whom I will give this piece of bread when I have dipped it.” So when he had dipped the piece of bread, he gave it to Judas, the son of Simon Iscariot. [27] After the piece of bread, then Satan entered into him. Then Jesus said to him, “What you do, do quickly.” [28] Now nobody at the table knew why he said this to him. [29] For some thought, because Judas had the money box, that Jesus said to him, “Buy what things we need for the feast,” or that he should give something to the poor. [30] Therefore having received that morsel, he went out immediately. It was night. [31] When he had gone out, Jesus said, “Now the Son of Man has been glorified, and God has been glorified in him.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.85,
      "assessment": "aligned",
      "explanation": "Accurately quoted, and the observation about Judas’ role with the money bag is directly supported by verse 29 (and elsewhere in John 12:6).",
      "confidence": "high"
    },
    {
      "id": "c9",
      "transcriptQuote": "So after receiving the morsel of bread, he immediately went out. And it was night.",
      "usageType": "verbatim",
      "claimSummary": "Judas' departure into the night resolves the narrative tension and reveals the betrayer.",
      "reference": "John 13:30",
      "passageReference": "John 13:28-32",
      "passageText": "[28] Now nobody at the table knew why he said this to him. [29] For some thought, because Judas had the money box, that Jesus said to him, “Buy what things we need for the feast,” or that he should give something to the poor. [30] Therefore having received that morsel, he went out immediately. It was night. [31] When he had gone out, Jesus said, “Now the Son of Man has been glorified, and God has been glorified in him. [32] If God has been glorified in him, God will also glorify him in himself, and he will glorify him immediately.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.55,
      "assessment": "aligned",
      "explanation": "Accurately quoted. The sermon treats \"and it was night\" as narrative resolution; John’s light/darkness motif arguably carries more weight here than the sermon draws out, but nothing is claimed that the text does not support. The lower text-match percentage reflects a translation difference, not a misquotation: the speaker reads the ESV (\"So after receiving the morsel of bread, he immediately went out\") against the card’s public-domain WEB grounding text (\"Therefore having received that morsel, he went out immediately\").",
      "confidence": "high"
    },
    {
      "id": "c10",
      "transcriptQuote": "And we know that for those who love God all things work together for the good, for those who are called according to his purpose.",
      "usageType": "verbatim",
      "claimSummary": "God’s sovereignty is a conditional promise: nothing enters a believer’s life without passing through his loving filter.",
      "reference": "Romans 8:28",
      "passageReference": "Romans 8:26-30",
      "passageText": "[26] In the same way, the Spirit also helps our weaknesses, for we don’t know how to pray as we ought. But the Spirit himself makes intercession for us with groanings which can’t be uttered. [27] He who searches the hearts knows what is on the Spirit’s mind, because he makes intercession for the saints according to God. [28] We know that all things work together for good for those who love God, for those who are called according to his purpose. [29] For whom he foreknew, he also predestined to be conformed to the image of his Son, that he might be the firstborn among many brothers. [30] Whom he predestined, those he also called. Whom he called, those he also justified. Whom he justified, those he also glorified.",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c10-i1",
          "excerpt": "My mom sent a care package and cookies, and my RDC, my recruit division commander — similar to a drill sergeant — got the package and was going through it. He’s like, \"Oh, it’s your birthday today. All right, for your birthday we’re going to do push-ups.\"",
          "kind": "personal-experience",
          "claimSupported": "The speaker’s own hardship at seventeen was real, which is why his defensiveness was understandable.",
          "alignment": "applies-text",
          "explanation": "The boot-camp material is vivid and earns the honesty of the admission that follows. It functions as background to the sovereignty point rather than proving it; the actual application to Romans 8:28 comes later when he asks whether his leaving was part of God’s plan.",
          "confidence": "medium"
        },
        {
          "id": "c10-i2",
          "excerpt": "Was me leaving at the time that I did part of God’s plan? Did God use that to bring good in my life, and also to grow my brothers? Yes. I could trust in that — in God’s sovereignty.",
          "kind": "personal-experience",
          "claimSupported": "God works all things together for good for those who love him and are called according to his purpose.",
          "alignment": "applies-text",
          "explanation": "This is the application done properly. He asks the question of his own history rather than asserting a tidy outcome, and the \"good\" he names is growth in himself and his brothers — which matches the Romans 8:29 definition he had just given, not comfort or a happy ending.",
          "confidence": "high"
        },
        {
          "id": "c10-i3",
          "excerpt": "When my parents divorced, I stepped into the father role and male role model for them. And after going through that early on in life, to again have it repeated at age 15 and at age 12 — I didn’t realize the hurt that it was causing them. So I needed to be gracious.",
          "kind": "personal-experience",
          "claimSupported": "Being gracious toward those who resent you means accounting for your own part in their hurt.",
          "alignment": "applies-text",
          "explanation": "A costly and specific admission that gives the \"be gracious\" application real content. It mirrors the sermon’s reading of Jesus seating Judas in a place of honour rather than distancing himself — grace extended toward the person on the other side of the rupture.",
          "confidence": "high"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": 0.78,
      "assessment": "aligned",
      "explanation": "Quoted accurately, and the guardrails the speaker puts around it are unusually careful: he explicitly denies that the verse means \"everything that happens is good\" or that there is \"a silver lining in everything,\" and grounds the promise in its stated conditions. That is the correct correction of the most common misuse of this verse.",
      "confidence": "high"
    },
    {
      "id": "c11",
      "transcriptQuote": "So the good in verse 28 is not our comfort, not our ease — it’s to conform us to the image of Jesus.",
      "usageType": "allusion",
      "claimSummary": "The \"good\" of Romans 8:28 is defined by verse 29 as conformity to Christ, not comfort.",
      "reference": "Romans 8:29",
      "passageReference": "Romans 8:27-31",
      "passageText": "[27] He who searches the hearts knows what is on the Spirit’s mind, because he makes intercession for the saints according to God. [28] We know that all things work together for good for those who love God, for those who are called according to his purpose. [29] For whom he foreknew, he also predestined to be conformed to the image of his Son, that he might be the firstborn among many brothers. [30] Whom he predestined, those he also called. Whom he called, those he also justified. Whom he justified, those he also glorified. [31] What then shall we say about these things? If God is for us, who can be against us?",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "aligned",
      "explanation": "Reading verse 28’s \"good\" through verse 29 — \"conformed to the image of his Son\" — is exactly the contextual move the passage invites, since verse 29 begins \"For…\" and supplies the definition. Letting the next verse define the previous one is sound handling.",
      "confidence": "high"
    },
    {
      "id": "c12",
      "transcriptQuote": "Put on the whole armor of God, that you may be able to stand against the schemes of the devil. For we do not wrestle against flesh and blood, but against the rulers, against the authorities",
      "usageType": "verbatim",
      "claimSummary": "Relational conflict has a spiritual dimension that requires God’s armour.",
      "reference": "Ephesians 6:11-12",
      "passageReference": "Ephesians 6:9-14",
      "passageText": "[9] You masters, do the same things to them, and give up threatening, knowing that he who is both their Master and yours is in heaven, and there is no partiality with him. [10] Finally, be strong in the Lord, and in the strength of his might. [11] Put on the whole armor of God, that you may be able to stand against the wiles of the devil. [12] For our wrestling is not against flesh and blood, but against the principalities, against the powers, against the world’s rulers of the darkness of this age, and against the spiritual forces of wickedness in the heavenly places. [13] Therefore put on the whole armor of God, that you may be able to withstand in the evil day, and having done all, to stand. [14] Stand therefore, having the utility belt of truth buckled around your waist, and having put on the breastplate of righteousness,",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.9,
      "assessment": "aligned",
      "explanation": "Quoted accurately as far as it goes. Applying the passage to relational conflict is a legitimate extension — Paul’s \"not against flesh and blood\" is precisely about how believers read opposition from people — though the immediate context is the believer’s standing against the devil generally, not interpersonal betrayal specifically.",
      "confidence": "high"
    },
    {
      "id": "c13",
      "transcriptQuote": "Praying at all times in the Spirit, with all prayer and supplication. To that end, keep alert with all perseverance, making supplication for all the saints.",
      "usageType": "verbatim",
      "claimSummary": "Paul closes the armour passage with a call to persistent prayer.",
      "reference": "Ephesians 6:18",
      "passageReference": "Ephesians 6:16-20",
      "passageText": "[16] above all, taking up the shield of faith, with which you will be able to quench all the fiery darts of the evil one. [17] And take the helmet of salvation, and the sword of the Spirit, which is the word of God; [18] with all prayer and requests, praying at all times in the Spirit, and being watchful to this end in all perseverance and requests for all the saints: [19] on my behalf, that utterance may be given to me in opening my mouth, to make known with boldness the mystery of the Good News, [20] for which I am an ambassador in chains; that in it I may speak boldly, as I ought to speak.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.61,
      "assessment": "aligned",
      "explanation": "Quoted accurately, and correctly identified as the closing of the armour passage. The point that prayer is where Paul lands the whole section is well taken from the text.",
      "confidence": "high"
    },
    {
      "id": "c14",
      "transcriptQuote": "Simon, Simon, behold, Satan demanded to have you, that he might sift you like wheat, but I have prayed for you that your faith may not fail. And when you have turned again, strengthen your brothers.",
      "usageType": "verbatim",
      "claimSummary": "Jesus himself prayed for Peter against satanic attack, modelling prayer in spiritual warfare.",
      "reference": "Luke 22:31-32",
      "passageReference": "Luke 22:29-34",
      "passageText": "[29] I confer on you a kingdom, even as my Father conferred on me, [30] that you may eat and drink at my table in my Kingdom. You will sit on thrones, judging the twelve tribes of Israel.” [31] The Lord said, “Simon, Simon, behold, Satan asked to have all of you, that he might sift you as wheat, [32] but I prayed for you, that your faith wouldn’t fail. You, when once you have turned again, establish your brothers.” [33] He said to him, “Lord, I am ready to go with you both to prison and to death!” [34] He said, “I tell you, Peter, the rooster will by no means crow today until you deny that you know me three times.”",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.79,
      "assessment": "aligned",
      "explanation": "Quoted accurately and used with real precision: this saying belongs to the same night and the same conversation as the denial prediction, so citing it as the proof that Jesus prayed for Peter *before* Peter failed is contextually exact, not merely thematic.",
      "confidence": "high"
    },
    {
      "id": "c15",
      "transcriptQuote": "But throughout those narratives there’s a phrase that comes up often. It says that \"my hour has not yet arrived.\"",
      "usageType": "allusion",
      "claimSummary": "John repeatedly marks that Jesus’ \"hour\" had not yet come before chapter 12.",
      "reference": "John 7:30",
      "passageReference": "John 7:28-32",
      "passageText": "[28] Jesus therefore cried out in the temple, teaching and saying, “You both know me, and know where I am from. I have not come of myself, but he who sent me is true, whom you don’t know. [29] I know him, because I am from him, and he sent me.” [30] They sought therefore to take him; but no one laid a hand on him, because his hour had not yet come. [31] But of the multitude, many believed in him. They said, “When the Christ comes, he won’t do more signs than those which this man has done, will he?” [32] The Pharisees heard the multitude murmuring these things concerning him, and the chief priests and the Pharisees sent officers to arrest him.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "aligned",
      "explanation": "John 7:30 does state that no one arrested Jesus \"because his hour had not yet come,\" and the same motif runs through John 2:4 and 8:20 as the speaker lists. Tracing that thread to its reversal in John 12:23 is genuine biblical-theological work within a single book.",
      "confidence": "high"
    },
    {
      "id": "c16",
      "transcriptQuote": "And Jesus answered them, \"The hour has come for the Son of Man to be glorified. Truly, truly, I say to you, unless a grain of wheat falls into the earth and dies, it remains alone, but if it dies, it bears much fruit.\"",
      "usageType": "verbatim",
      "claimSummary": "The arrival of \"the hour\" identifies glorification with Jesus’ death.",
      "reference": "John 12:23-24",
      "passageReference": "John 12:21-26",
      "passageText": "[21] These, therefore, came to Philip, who was from Bethsaida of Galilee, and asked him, saying, “Sir, we want to see Jesus.” [22] Philip came and told Andrew, and in turn, Andrew came with Philip, and they told Jesus. [23] Jesus answered them, “The time has come for the Son of Man to be glorified. [24] Most certainly I tell you, unless a grain of wheat falls into the earth and dies, it remains by itself alone. But if it dies, it bears much fruit. [25] He who loves his life will lose it. He who hates his life in this world will keep it to eternal life. [26] If anyone serves me, let him follow me. Where I am, there my servant will also be. If anyone serves me, the Father will honor him.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.88,
      "assessment": "aligned",
      "explanation": "Quoted accurately. The identification of \"glorified\" with the crucifixion is not the speaker’s imposition — verse 24 immediately explains it with the grain of wheat that must die, and John 12:33 says plainly that Jesus was showing \"by what kind of death he was going to die.\"",
      "confidence": "high"
    },
    {
      "id": "c17",
      "transcriptQuote": "if you look at the Ten Commandments, the first four are how we’re supposed to love God, and the last six are how we’re supposed to love one another",
      "usageType": "allusion",
      "claimSummary": "The Decalogue already divides into love of God and love of neighbour.",
      "reference": "Exodus 20:1-17",
      "passageReference": "Exodus 20:1-19",
      "passageText": "[1] God spoke all these words, saying, [2] “I am Yahweh your God, who brought you out of the land of Egypt, out of the house of bondage. [3] “You shall have no other gods before me. [4] “You shall not make for yourselves an idol, nor any image of anything that is in the heavens above, or that is in the earth beneath, or that is in the water under the earth: [5] you shall not bow yourself down to them, nor serve them, for I, Yahweh your God, am a jealous God, visiting the iniquity of the fathers on the children, on the third and on the fourth generation of those who hate me, [6] and showing loving kindness to thousands of those who love me and keep my commandments. [7] “You shall not misuse the name of Yahweh your God, for Yahweh will not hold him guiltless who misuses his name. [8] “Remember the Sabbath day, to keep it holy. [9] You shall labor six days, and do all your work, [10] but the seventh day is a Sabbath to Yahweh your God. You shall not do any work in it, you, nor your son, nor your daughter, your male servant, nor your female servant, nor your livestock, nor your stranger who is within your gates; [11] for in six days Yahweh made heaven and earth, the sea, and all that is in them, and rested the seventh day; therefore Yahweh blessed the Sabbath day, and made it holy. [12] “Honor your father and your mother, that your days may be long in the land which Yahweh your God gives you. [13] “You shall not murder. [14] “You shall not commit adultery. [15] “You shall not steal. [16] “You shall not give false testimony against your neighbor. [17] “You shall not covet your neighbor’s house. You shall not covet your neighbor’s wife, nor his male servant, nor his female servant, nor his ox, nor his donkey, nor anything that is your neighbor’s.” [18] All the people perceived the thunderings, the lightnings, the sound of the trumpet, and the mountain smoking. When the people saw it, they trembled, and stayed at a distance. [19] They said to Moses, “Speak with us yourself, and we will listen; but don’t let God speak with us, lest we die.”",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "disputed-secondary",
      "explanation": "The \"first four / last six\" division of the Decalogue is the Reformed and broader Protestant numbering. Lutheran and Roman Catholic traditions number the commandments differently and divide them three and seven. The theological point being made — that the Law already commands both love of God and love of neighbour — holds under either numbering, but the specific 4/6 split is a denominational convention stated here as plain fact.",
      "confidence": "high"
    },
    {
      "id": "c18",
      "transcriptQuote": "You shall not take vengeance or bear a grudge against the sons of your own people, but you shall love your neighbor as yourself.",
      "usageType": "verbatim",
      "claimSummary": "Love of neighbour is already commanded in the Law, so the newness of John 13:34 lies elsewhere.",
      "reference": "Leviticus 19:18",
      "passageReference": "Leviticus 19:16-20",
      "passageText": "[16] “ ‘You shall not go around as a slanderer among your people. “ ‘You shall not endanger the life of your neighbor. I am Yahweh. [17] “ ‘You shall not hate your brother in your heart. You shall surely rebuke your neighbor, and not bear sin because of him. [18] “ ‘You shall not take vengeance, nor bear any grudge against the children of your people; but you shall love your neighbor as yourself. I am Yahweh. [19] “ ‘You shall keep my statutes. “ ‘You shall not cross-breed different kinds of animals. “ ‘You shall not sow your field with two kinds of seed; “ ‘Don’t wear a garment made of two kinds of material. [20] “ ‘If a man lies carnally with a woman who is a slave girl, pledged to be married to another man, and not ransomed or given her freedom; they shall be punished. They shall not be put to death, because she was not free.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.9,
      "assessment": "aligned",
      "explanation": "Quoted accurately. Using it to press the question \"so is loving each other really new?\" is a fair and important challenge to the text, and it is the very verse Jesus himself cites as the second greatest commandment (Matthew 22:39).",
      "confidence": "high"
    },
    {
      "id": "c19",
      "transcriptQuote": "You shall treat the stranger who sojourns with you as the native among you, and you shall love him as yourself, for you were strangers in the land of Egypt. I am the LORD your God.",
      "usageType": "verbatim",
      "claimSummary": "The Law extended neighbour-love even to the sojourner.",
      "reference": "Leviticus 19:34",
      "passageReference": "Leviticus 19:32-36",
      "passageText": "[32] “ ‘You shall rise up before the gray head and honor the face of the elderly; and you shall fear your God. I am Yahweh. [33] “ ‘If a stranger lives as a foreigner with you in your land, you shall not do him wrong. [34] The stranger who lives as a foreigner with you shall be to you as the native-born among you, and you shall love him as yourself; for you lived as foreigners in the land of Egypt. I am Yahweh your God. [35] “ ‘You shall do no unrighteousness in judgment, in measures of length, of weight, or of quantity. [36] You shall have just balances, just weights, a just ephah, and a just hin. I am Yahweh your God, who brought you out of the land of Egypt.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.8,
      "assessment": "aligned",
      "explanation": "Quoted accurately, including the motive clause \"for you were strangers in the land of Egypt.\" Adding it to 19:18 strengthens the argument by showing the Law’s neighbour-love already reached beyond the in-group.",
      "confidence": "high"
    },
    {
      "id": "c20",
      "transcriptQuote": "Jesus is restoring the nations to their Creator. He loved people to restore their relationship with God.",
      "usageType": "uncited-claim",
      "claimSummary": "The purpose of the cross is stated as restoring people to relationship with God.",
      "reference": "2 Corinthians 5:18-19",
      "passageReference": "2 Corinthians 5:16-21",
      "passageText": "[16] Therefore we know no one after the flesh from now on. Even though we have known Christ after the flesh, yet now we know him so no more. [17] Therefore if anyone is in Christ, he is a new creation. The old things have passed away. Behold, all things have become new. [18] But all things are of God, who reconciled us to himself through Jesus Christ, and gave to us the ministry of reconciliation; [19] namely, that God was in Christ reconciling the world to himself, not reckoning to them their trespasses, and having committed to us the word of reconciliation. [20] We are therefore ambassadors on behalf of Christ, as though God were entreating by us: we beg you on behalf of Christ, be reconciled to God. [21] For him who knew no sin he made to be sin on our behalf; so that in him we might become the righteousness of God.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "aligned",
      "explanation": "The claim is made without a citation, but it is well supported: 2 Corinthians 5:18-19 states that God \"was in Christ reconciling the world to himself.\" The word \"nations\" is not from this passage — it echoes the Abrahamic promise (Genesis 12:3) and Revelation 22:2 — so the framing is broader than the verse behind it, though not contrary to it. Worth citing explicitly when preached.",
      "confidence": "medium"
    },
    {
      "id": "c21",
      "transcriptQuote": "Greater love has no one than this, that someone lay down his life for his friends.",
      "usageType": "verbatim",
      "claimSummary": "Christlike love is self-sacrificial to the point of death.",
      "reference": "John 15:13",
      "passageReference": "John 15:11-15",
      "passageText": "[11] I have spoken these things to you, that my joy may remain in you, and that your joy may be made full. [12] “This is my commandment, that you love one another, even as I have loved you. [13] Greater love has no one than this, that someone lay down his life for his friends. [14] You are my friends, if you do whatever I command you. [15] No longer do I call you servants, for the servant doesn’t know what his lord does. But I have called you friends, for everything that I heard from my Father, I have made known to you.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 1,
      "assessment": "aligned",
      "explanation": "Quoted accurately and used for its plain sense. It also sits in the same Upper Room discourse as the sermon text, two chapters later, so it is Jesus’ own expansion of the new commandment rather than an outside proof text.",
      "confidence": "high"
    },
    {
      "id": "c22",
      "transcriptQuote": "But God shows his love for us in that while we were still sinners, Christ died for us.",
      "usageType": "verbatim",
      "claimSummary": "Christ’s love is unconditional — given before any change in us.",
      "reference": "Romans 5:8",
      "passageReference": "Romans 5:6-10",
      "passageText": "[6] For while we were yet weak, at the right time Christ died for the ungodly. [7] For one will hardly die for a righteous man. Yet perhaps for a righteous person someone would even dare to die. [8] But God commends his own love toward us, in that while we were yet sinners, Christ died for us. [9] Much more then, being now justified by his blood, we will be saved from God’s wrath through him. [10] For if while we were enemies, we were reconciled to God through the death of his Son, much more, being reconciled, we will be saved by his life.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.79,
      "assessment": "aligned",
      "explanation": "Quoted accurately. The point drawn — that the love came first, \"while we were still sinners\" — is the explicit logic of the verse.",
      "confidence": "high"
    },
    {
      "id": "c23",
      "transcriptQuote": "Love is patient and kind; love does not envy or boast; it is not arrogant or rude. It does not insist on its own way; it is [not] irritable or resentful; it does [not] rejoice at wrongdoing, but rejoices with the truth. Love bears all things, believes all things, hopes all things",
      "usageType": "verbatim",
      "claimSummary": "Paul describes unconditional love to a church that was failing to practise it.",
      "reference": "1 Corinthians 13:4-7",
      "passageReference": "1 Corinthians 13:2-9",
      "passageText": "[2] If I have the gift of prophecy, and know all mysteries and all knowledge; and if I have all faith, so as to remove mountains, but don’t have love, I am nothing. [3] If I give away all my goods to feed the poor, and if I give my body to be burned, but don’t have love, it profits me nothing. [4] Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud, [5] doesn’t behave itself inappropriately, doesn’t seek its own way, is not provoked, takes no account of evil; [6] doesn’t rejoice in unrighteousness, but rejoices with the truth; [7] bears all things, believes all things, hopes all things, and endures all things. [8] Love never fails. But where there are prophecies, they will be done away with. Where there are various languages, they will cease. Where there is knowledge, it will be done away with. [9] For we know in part and we prophesy in part;",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.65,
      "assessment": "aligned",
      "explanation": "The quotation is substantially accurate; several negations were garbled in the recording (\"it is irritable,\" \"it does rejoice at wrongdoing\") and read correctly as \"is not\" and \"does not\" in context. The contextual note is a real strength: the speaker points out Paul is writing to a church that was failing at love, which resists the sentimental wedding-reading of this passage.",
      "confidence": "medium"
    },
    {
      "id": "c24",
      "transcriptQuote": "And Jesus said, \"Father, forgive them, for they know not what they do.\" And they cast lots to divide his garments.",
      "usageType": "verbatim",
      "claimSummary": "Christlike love forgives, as Jesus did from the cross.",
      "reference": "Luke 23:34",
      "passageReference": "Luke 23:32-36",
      "passageText": "[32] There were also others, two criminals, led with him to be put to death. [33] When they came to the place that is called “The Skull”, they crucified him there with the criminals, one on the right and the other on the left. [34] Jesus said, “Father, forgive them, for they don’t know what they are doing.” Dividing his garments among them, they cast lots. [35] The people stood watching. The rulers with them also scoffed at him, saying, “He saved others. Let him save himself, if this is the Christ of God, his chosen one!” [36] The soldiers also mocked him, coming to him and offering him vinegar,",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.79,
      "assessment": "aligned",
      "explanation": "Quoted accurately. Leaders should be aware this sentence is textually disputed — it is absent from several early manuscripts and modern translations bracket it or footnote it — though it is retained in the ESV text the speaker is reading. The doctrine it supports (Christ forgiving his executioners) is not in doubt elsewhere in Scripture.",
      "confidence": "medium"
    },
    {
      "id": "c25",
      "transcriptQuote": "For all have sinned and fall short of the glory of God.",
      "usageType": "verbatim",
      "claimSummary": "Failure is universal, so Peter’s denial is not exceptional.",
      "reference": "Romans 3:23",
      "passageReference": "Romans 3:21-25",
      "passageText": "[21] But now apart from the law, a righteousness of God has been revealed, being testified by the law and the prophets; [22] even the righteousness of God through faith in Jesus Christ to all and on all those who believe. For there is no distinction, [23] for all have sinned, and fall short of the glory of God; [24] being justified freely by his grace through the redemption that is in Christ Jesus; [25] whom God sent to be an atoning sacrifice, through faith in his blood, for a demonstration of his righteousness through the passing over of prior sins, in God’s forbearance;",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 1,
      "assessment": "aligned",
      "explanation": "Quoted accurately and used for its plain meaning — the universality of sin. The speaker notably tells the congregation to keep reading in context (\"if you continue reading, again, this within its context, it is amazing\"), which points toward verse 24’s \"justified by his grace as a gift\" rather than leaving the verse as bare condemnation.",
      "confidence": "high"
    },
    {
      "id": "c26",
      "transcriptQuote": "Abide in me, and I in you. As the branch cannot bear fruit by itself unless it abides in the vine, neither can you unless you abide in me.",
      "usageType": "verbatim",
      "claimSummary": "The response to certain failure is abiding in Christ, not more self-effort.",
      "reference": "John 15:4-5",
      "passageReference": "John 15:2-7",
      "passageText": "[2] Every branch in me that doesn’t bear fruit, he takes away. Every branch that bears fruit, he prunes, that it may bear more fruit. [3] You are already pruned clean because of the word which I have spoken to you. [4] Remain in me, and I in you. As the branch can’t bear fruit by itself unless it remains in the vine, so neither can you, unless you remain in me. [5] I am the vine. You are the branches. He who remains in me and I in him bears much fruit, for apart from me you can do nothing. [6] If a man doesn’t remain in me, he is thrown out as a branch and is withered; and they gather them, throw them into the fire, and they are burned. [7] If you remain in me, and my words remain in you, you will ask whatever you desire, and it will be done for you.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.79,
      "assessment": "aligned",
      "explanation": "Quoted accurately. The gloss on menō (\"to remain in a place with somebody\") is defensible — the verb does mean to remain, stay, or abide — though \"spend time with someone\" softens it: in John the word carries continuing union and dependence, not merely companionship. The sermon’s own conclusion (\"apart from him we can do nothing\") recovers the stronger sense.",
      "confidence": "high"
    },
    {
      "id": "c27",
      "transcriptQuote": "Take my yoke upon you, and learn from me, for I am gentle and lowly [in heart, and you will find rest for your souls. For my yoke is easy, and my burden is light.]",
      "usageType": "verbatim",
      "claimSummary": "Abiding in Christ yields rest rather than the burden of religious legalism.",
      "reference": "Matthew 11:29-30",
      "passageReference": "Matthew 11:27-30",
      "passageText": "[27] All things have been delivered to me by my Father. No one knows the Son, except the Father; neither does anyone know the Father, except the Son, and he to whom the Son desires to reveal him. [28] “Come to me, all you who labor and are heavily burdened, and I will give you rest. [29] Take my yoke upon you, and learn from me, for I am gentle and humble in heart; and you will find rest for your souls. [30] For my yoke is easy, and my burden is light.”",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c27-i1",
          "excerpt": "To be honest, this is probably the area I struggle most — you can ask my family. I struggle at letting them know when I mess up. I am a go-go-go person; I don’t like to sit still.",
          "kind": "personal-experience",
          "claimSupported": "Receiving Christ’s rest is the hardest application for those who work in their own strength.",
          "alignment": "applies-text",
          "explanation": "Self-implicating rather than illustrative-at-a-distance. Admitting an unresolved struggle immediately after preaching rest keeps the application from becoming advice the speaker has exempted himself from.",
          "confidence": "high"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": 0.96,
      "assessment": "aligned",
      "explanation": "Quoted accurately. The contrast drawn — rest offered by Christ over against \"the heavy burdens of religious legalism\" — fits the context, where Jesus is speaking against burdens laid on people by the religious leadership.",
      "confidence": "high"
    },
    {
      "id": "c28",
      "transcriptQuote": "Jesus is restoring the rest that was meant to take place in the creation narrative. The seventh day of creation was meant for eternity.",
      "usageType": "uncited-claim",
      "claimSummary": "The rest Jesus offers is the restoration of the creation Sabbath.",
      "reference": "Hebrews 4:9-11",
      "passageReference": "Hebrews 4:7-13",
      "passageText": "[7] he again defines a certain day, today, saying through David so long a time afterward (just as has been said), “Today if you will hear his voice, don’t harden your hearts.” [8] For if Joshua had given them rest, he would not have spoken afterward of another day. [9] There remains therefore a Sabbath rest for the people of God. [10] For he who has entered into his rest has himself also rested from his works, as God did from his. [11] Let’s therefore give diligence to enter into that rest, lest anyone fall after the same example of disobedience. [12] For the word of God is living and active, and sharper than any two-edged sword, piercing even to the dividing of soul and spirit, of both joints and marrow, and is able to discern the thoughts and intentions of the heart. [13] There is no creature that is hidden from his sight, but all things are naked and laid open before the eyes of him to whom we must give an account.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": null,
      "assessment": "context-caution",
      "explanation": "The core claim is supportable: Hebrews 4:9 says \"there remains a Sabbath rest for the people of God,\" and Hebrews 4:4 grounds it in the seventh day of Genesis 2. But \"the seventh day of creation was meant for eternity\" is stated as a bare fact without citation, and it compresses a substantial argument — Hebrews reaches that conclusion through Psalm 95 and Joshua, not directly from Genesis 2. The claim needs the Hebrews 4 argument attached to it, or it lands as an assertion the hearer cannot check.",
      "confidence": "medium"
    },
    {
      "id": "c29",
      "transcriptQuote": "If you are offering your gift at the altar and there remember that your brother has something against you, leave your gift there before the altar. First be reconciled to your brother, and then come and offer your gift.",
      "usageType": "verbatim",
      "claimSummary": "Reconciliation with a brother takes priority over worship.",
      "reference": "Matthew 5:23-24",
      "passageReference": "Matthew 5:21-26",
      "passageText": "[21] “You have heard that it was said to the ancient ones, ‘You shall not murder;’ and ‘Whoever murders will be in danger of the judgment.’ [22] But I tell you that everyone who is angry with his brother without a cause will be in danger of the judgment. Whoever says to his brother, ‘Raca!’ will be in danger of the council. Whoever says, ‘You fool!’ will be in danger of the fire of Gehenna. [23] “If therefore you are offering your gift at the altar, and there remember that your brother has anything against you, [24] leave your gift there before the altar, and go your way. First be reconciled to your brother, and then come and offer your gift. [25] Agree with your adversary quickly, while you are with him on the way; lest perhaps the prosecutor deliver you to the judge, and the judge deliver you to the officer, and you be cast into prison. [26] Most certainly I tell you, you shall by no means get out of there, until you have paid the last penny.",
      "translation": "WEB",
      "illustrations": [
        {
          "id": "c29-i1",
          "excerpt": "Just this last month my son Sam got married, and my mom and two brothers were able to come for the wedding. And this was in the last 28 years that I’ve been out of the home, in the military.",
          "kind": "personal-experience",
          "claimSupported": "Pursuing reconciliation with a brother is worth interrupting other things for.",
          "alignment": "applies-text",
          "explanation": "Placed immediately before the altar call, it shows partial reconciliation actually happening over years rather than promising a resolution. He is careful not to present it as finished — \"we’ve been through a lot together\" — which keeps it honest against Matthew 5:24’s ongoing imperative.",
          "confidence": "high"
        }
      ],
      "quoteVerified": true,
      "quoteMatch": 0.97,
      "assessment": "aligned",
      "explanation": "Quoted accurately, and applied exactly as the passage intends — as grounds for interrupting worship to pursue reconciliation. Using it at the altar call is arguably the most contextually faithful possible use of this text.",
      "confidence": "high"
    },
    {
      "id": "c30",
      "transcriptQuote": "I will bless the LORD at all times; his praise shall continually be in my mouth. My soul makes its boast in the LORD; let the humble hear and be glad. Oh, magnify the LORD with me, and let us exalt his name together! I sought the LORD, and he answered me and delivered me from all my fears.",
      "usageType": "verbatim",
      "claimSummary": "The closing reading calls the congregation to seek the Lord and be delivered from fear.",
      "reference": "Psalm 34:1-5",
      "passageReference": "Psalm 34:1-7",
      "passageText": "[1] I will bless Yahweh at all times. His praise will always be in my mouth. [2] My soul shall boast in Yahweh. The humble shall hear of it and be glad. [3] Oh magnify Yahweh with me. Let’s exalt his name together. [4] I sought Yahweh, and he answered me, and delivered me from all my fears. [5] They looked to him, and were radiant. Their faces shall never be covered with shame. [6] This poor man cried, and Yahweh heard him, and saved him out of all his troubles. [7] Yahweh’s angel encamps around those who fear him, and delivers them.",
      "translation": "WEB",
      "illustrations": [],
      "quoteVerified": true,
      "quoteMatch": 0.65,
      "assessment": "aligned",
      "explanation": "Quoted accurately from verses 1-5. Used doxologically to close the service rather than exegeted, which is appropriate to its function here; the psalm’s superscription (David’s deliverance while feigning madness before Abimelech) would, if anything, reinforce the sermon’s theme of God meeting people in genuine distress.",
      "confidence": "high"
    }
  ],
  "disclaimer": "AI-assisted review to support your own examination, not replace it. Every assessment is anchored to the fetched scripture text shown on the card — read it and judge for yourself. \"They received the word with all eagerness, examining the Scriptures daily to see if these things were so.\" (Acts 17:11)"
}$report$::jsonb,
    'agent:sermon-berean-review',
    'berean-v4'
  )
  on conflict (talk_id) do update set
    report         = excluded.report,
    model          = excluded.model,
    prompt_version = excluded.prompt_version,
    updated_at     = now();
end $$;
