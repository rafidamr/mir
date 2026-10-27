# Test run

Run on 2026-10-27 with knowledge base `kb-b2e9e9d4`. 30 test questions and 6 off-topic test messages, none of them used for tuning. Each model answers on its own, with the gateway's prompt and no fallback. The answers are graded by Claude Opus 5.5 (claude-opus-5-5), highest effort against the support team's reply from Bitext, without being told which model wrote them.

## The two configurations

| Model | Thinking | Recorded price, in / out | List price, in / out |
|---|---|---|---|
| gemini-3.5-flash-lite | low | $0 / $0 | $0.3 / $2.5 |
| openai/gpt-6-luna | none | $0.1 / $0.5 | $0.1 / $0.5 |

Prices are US dollars per million tokens. Gemini is recorded at $0 because it runs on the free tier.

## Intent and refusals (the same for both models)

The lookup picks the intent, and decides whether to refuse, before any model is called. A near-copy is a test question whose closest knowledge-base question has a similarity of 0.95 or more.

| | Near-copies | The rest | All |
|---|---|---|---|
| Test questions | 21 | 9 | 30 |
| Intent right | 21 | 8 | 29 (96.7%) |
| Refused by mistake | 0 | 0 | 0 |

Off-topic messages refused: 6 of 6.

On the 270 practice questions the intent was right 98.1% of the time (see `vote-benchmark-bge-small.md`).

## Results

| | gemini-3.5-flash-lite | openai/gpt-6-luna |
|---|---|---|
| Answered | 30 of 30 | 29 of 30 |
| Failed | 0 | 1 |
| Average grade (1 to 5) | 4.27 | 4.38 |
| … on near-copies | 4.43 | 4.45 |
| … on the rest | 3.89 | 4.22 |
| Graded 4 or 5 | 26 of 30 | 27 of 29 |
| Made something up | 6 | 4 |
| First words, median / slowest | 6.65 s / 23.96 s | 1.43 s / 2.54 s |
| Whole answer, median / slowest | 6.77 s / 24.43 s | 2.01 s / 4.03 s |
| Tokens per answer, in / out (average) | 498 / 152 | 462 / 67 |
| Cost per answer, as recorded | $0 | $0.000080 |
| Cost per answer, at list price | $0.00053 | $0.000080 |
| Cost per good answer (graded 4 or 5), at list price | $0.00061 | $0.000086 |
| Total cost of the answers, at list price | $0.016 | $0.0023 |

Speed and cost cover the answered test questions. Times are measured inside the gateway code, so they leave out the network. Speed also depends on each provider's load at the time of the run, and Gemini runs on Google's free tier.

## Answers graded 3 or lower

- **2**, gemini-3.5-flash-lite, "how can I take a quick look at my invoice #37777?": The reply only acknowledges the request and promises to "retrieve the details," which it never does and likely can't, and it never tells the customer how to view the invoice (log in, open the Invoices section, click the invoice number) as the reference does.
- **3**, gemini-3.5-flash-lite, "where to see what payment options are available?": The reply lists the correct payment methods and mentions the checkout page, but its main answer to "where" points to a made-up "Payment Options" section under a Help tab, and it names card brands (Visa, Mastercard, American Express) that the reference doesn't confirm and that could mislead the customer.
- **2**, gemini-3.5-flash-lite, "where do I see what options for delivery you offer?": The reply never tells the customer where to find delivery options (the product page or checkout, as the reference says); instead it lists specific services, such as next-business-day Overnight Shipping and In-Store Pickup, that the reference doesn't support and that could mislead the customer.
- **2**, gemini-3.5-flash-lite, "lcate order {{Order Number}}": The reply mistakes a request to locate an order for one to modify it, and gives invented steps such as a 'Modify'/'Edit' option and going through checkout again; only the mention of finding the order in the 'Orders' section loosely helps with what the customer asked.
- **3**, openai/gpt-6-luna, "where do I see what options for delivery you offer?": The reply correctly sends the customer to checkout, but it leaves out the product page and the option to contact support, and it names specific services (express, same-day delivery in select areas, in-store pickup) that the reference doesn't support and that could mislead the customer.
- **2**, openai/gpt-6-luna, "lcate order {{Order Number}}": The customer asked to locate order {{Order Number}}, but the reply wrongly treats it as a request to change the order and never asks for the details needed to find it, as the reference does.

## For checking by hand

10 graded answers picked at random. For each, note whether you agree with the grade.

### 1. bitext-10472, openai/gpt-6-luna

**Customer:** I want help opening a standard account

**Answer:** I’d be happy to help you open a standard account. To get started, please provide your full name, email address, and preferred username. Once I have these details, I’ll guide you through the account creation process. Your privacy and security are important to us, and your information will be handled with care.

**Reference (start):** That's fantastic! I'm here to assist you with opening a standard account. To get started, I will need a few essential details from you. Could you please provide me with your full name, email address, and a username? Once I have this information, I will guide you through the process step by step, ens…

**Grade:** 5. The reply asks for the same details as the reference (full name, email address and username), says it will guide the customer through the next steps, and reassures them about privacy without adding anything that isn't supported.

**You agree:** yes / ~~no~~

### 2. bitext-15208, gemini-3.5-flash-lite

**Customer:** what do i need to do to get my invoices from {{Person Name}}

**Answer:** I realized that you need assistance with accessing invoices from {{Person Name}}. Don't worry, I'm here to help you with that. To get your invoices, you can follow these steps: 1. Log in to your account on our website using your credentials. 2. Navigate to the "Invoices" section or a similar option. 3. Look for the option to filter or search invoices by name or date range. 4. Enter the necessary details such as the client's name ({{Person Name}}) or any other relevant information to filter the invoices. 5. Once you've applied the filter, you should be able to see the list of invoices associated with {{Person Name}}. 6. Click on the desired invoice to view its details or download a copy. If you encounter any difficulties or have further questions along the way, please feel free to reach out to me. I'm more than happy to assist you.

**Reference (start):** I see your request to access invoices from {{Person Name}}. To get your invoices, you can follow these steps: 1. Log in to your account on our website. 2. Navigate to the "Invoices" section. 3. Select the option to filter invoices by customer. 4. Enter the name "{{Person Name}}" in the search bar or…

**Grade:** 5. The reply covers every step in the reference (log in, open the Invoices section, filter or search by {{Person Name}}, view the matching invoices) and adds harmless general advice about opening or downloading an invoice, with no invented fees, deadlines or policies.

**You agree:** yes / ~~no~~

### 3. bitext-07232, gemini-3.5-flash-lite

**Customer:** i try to make a bloody consumer complaint against ur company

**Answer:** I'm sorry to hear that you're frustrated and in need of assistance to file a consumer complaint. Your concerns are of great importance to us, and we want to ensure that your experience is addressed appropriately. To assist you further, could you please provide me with the specific details of the complaint, including any relevant information such as dates, names, or {{Order Number}}? This will allow me to understand the situation better and guide you towards the necessary steps to file your complaint. Rest assured, we take complaints seriously and will do everything we can to address your concerns.

**Reference (start):** I'm very sorry to hear that you're feeling frustrated and want to file a complaint against our company. I understand that this situation has caused you a great deal of dissatisfaction, and I sincerely apologize for any inconvenience caused. Your feedback is extremely important to us, and I would lik…

**Grade:** 5. The reply covers everything the reference does: it acknowledges the customer's frustration, apologizes, says complaints are taken seriously and asks for details (dates, names, {{Order Number}}) to move the complaint forward, and it invents no fees, deadlines or policies.

**You agree:** yes / ~~no~~

### 4. bitext-10472, gemini-3.5-flash-lite

**Customer:** I want help opening a standard account

**Answer:** I'm thrilled to assist you in opening a standard account! Let's begin the process together. Please provide me with your full name, email address, and a preferred username. Once I have these details, I'll guide you step-by-step through the account creation process, ensuring that you have a seamless experience. Rest assured that your privacy and security are of utmost importance to us, and your information will be handled with the highest level of care. Let's get started on this exciting journey!

**Reference (start):** That's fantastic! I'm here to assist you with opening a standard account. To get started, I will need a few essential details from you. Could you please provide me with your full name, email address, and a username? Once I have this information, I will guide you through the process step by step, ens…

**Grade:** 5. The reply asks for the same details as the reference (full name, email address and preferred username), promises step-by-step guidance and reassures the customer about privacy, without inventing any facts.

**You agree:** yes / ~~no~~

### 5. bitext-21631, openai/gpt-6-luna

**Customer:** need assistance to notify of issues with a sign-up

**Answer:** We’re sorry you’re having trouble signing up. Could you share a few more details about what happened, including any error message you received and the step where the issue occurred? This will help us better understand and address the problem. You can also contact our support team through the official channels listed on our website’s “Contact Us” page, or visit our support page to report a sign-up issue. We appreciate you bringing this to our attention.

**Reference (start):** Thank you for trusting to us for assistance with notifying the issues you encountered during the sign-up process. We understand that experiencing difficulties during sign-up can be frustrating, and we want to assure you that we're here to help. To better assist you, could you please provide more det…

**Grade:** 5. Like the reference, the reply apologizes and asks for more details, and it helpfully names which ones (the error message and the step where it failed); the mention of a 'Contact Us' page is general, harmless advice, not a specific made-up contact detail.

**You agree:** yes / ~~no~~

### 6. bitext-24850, gemini-3.5-flash-lite

**Customer:** I do not know what I need to do to change to the pro account

**Answer:** I perceive that you are unsure about the steps to switch to the {{Account Type}} account. Don't worry, I'm here to guide you through the process: 1. Log in: Start by logging in to your account on our platform. 2. Account Settings: Once inside, navigate to the '{{Settings}}' or '{{Profile}}' section. 3. Upgrade Option: Look for an option that says '{{Upgrade Account}}' or '{{Account Change}}'. 4. {{Account Type}} Account: Choose the '{{Account Type}}' option from the list. 5. Follow Instructions: Follow the on-screen instructions to complete the switch to the {{Account Type}} account. If you encounter any difficulties or have further questions, please feel free to reach out. We're committed to assisting you throughout the journey and ensuring a smooth transition to the {{Account Type}} account. Enjoy the enhanced features and benefits that come with it!

**Reference (start):** No problem at all! I'm here to guide you through the process of changing to the {{Account Type}} account: 1. Log in: Start by accessing our platform with your credentials. 2. Account Settings: Once logged in, navigate to the '{{Settings}}' or '{{Profile}}' section of your account. 3. Upgrade Option:…

**Grade:** 5. The reply gives the same five steps as the reference (log in, open Settings/Profile, find the upgrade option, choose the {{Account Type}} account, follow the prompts), keeps the placeholders and invents nothing.

**You agree:** yes / ~~no~~

### 7. bitext-05325, gemini-3.5-flash-lite

**Customer:** where to see what payment options are available?

**Answer:** Sure! Let me guide you on how to find the list of payment options. To view our available payment methods, you can visit our website's homepage and navigate to the "Payment Options" section. You'll usually find this under the "Help" or "Customer Support" tab. Alternatively, you can also look for a "Payment Methods" or "Checkout" page during the ordering process. To give you a quick overview, here are the various payment methods we offer: - Credit/Debit Card (Visa, Mastercard, American Express) - PayPal - Bank Transfer - Apple Pay - Google Wallet If you're unable to locate this information or encounter any difficulties, feel free to reach out to our customer support team, available {{Customer Support Hours}} at {{Customer Support Phone Number}}. We're here to help you every step of the way!

**Reference (start):** Sure! I'm here to assist you in finding the available payment options. To view our payment methods, please visit our website's checkout page. There, you will be presented with a range of options to select from, including credit/debit cards, PayPal, bank transfers, Apple Pay, and Google Wallet. If yo…

**Grade:** 3, made something up. The reply lists the correct payment methods and mentions the checkout page, but its main answer to "where" points to a made-up "Payment Options" section under a Help tab, and it names card brands (Visa, Mastercard, American Express) that the reference doesn't confirm and that could mislead the customer.

**You agree:** yes / ~~no~~

### 8. bitext-00480, gemini-3.5-flash-lite

**Customer:** need assistance with canceling order {{Order Number}}

**Answer:** I've understood that you require assistance with canceling your order associated with the purchase number {{Order Number}}. This is a valid concern, and I'm here to guide you through the process. To cancel your order, please follow these steps: 1. Sign in to your {{Online Company Portal Info}} using your credentials. 2. Locate the '{{Online Order Interaction}}' or '{{Online Order Interaction}}' section within your account. 3. Find the specific order with the purchase number {{Order Number}}. 4. Look for the option labeled '{{Online Order Interaction}}' and select it to initiate the cancellation process. 5. Follow any additional prompts or requirements provided by the system to complete the cancellation. If you encounter any difficulties or have further questions, our dedicated support team is available to help. You can reach us during {{Customer Support Hours}} at {{Customer Support Phone Number}} or through the Live Chat feature on our website at {{Website URL}}. We value your satisfaction as our customer, and we're committed to ensuring a smooth cancellation process for you. Don't hesitate to reach out for any assistance you may need.

**Reference (start):** I recognize that you need assistance with canceling order {{Order Number}}, and I'm here to help you with that. We value your decision and want to ensure a smooth cancellation process for you. Here's what you can do: 1. Sign in to Your Account: Access our platform by signing in to your {{Online Comp…

**Grade:** 5. The reply covers every part of the reference: the same five cancellation steps (sign in, go to the orders section, find the order, choose the cancel option, follow any further prompts) and the same support hours, phone and live chat options, using the correct placeholders and adding no unsupported facts.

**You agree:** yes / ~~no~~

### 9. bitext-18858, gemini-3.5-flash-lite

**Customer:** I need assistance to notify of an error with online payments

**Answer:** We understand that you're seeking assistance in notifying us about problems with your online payments. We're here to provide the support you need. When it comes to reporting an error with online payments, we've made the process as seamless as possible for you. You can inform us about any errors you encounter by reaching out to our dedicated customer support team through phone, email, or live chat, and they will be more than happy to assist you in resolving the issue promptly. To ensure a smooth resolution, please share more details about the specific problems you're encountering, such as your {{Order Number}}. This will allow us to better understand the issue and guide you towards a solution. Rest assured that your feedback is valuable to us, and we will work diligently to address the error and ensure a smooth payment experience for you going forward. Thank you for bringing this matter to our attention, and we appreciate your patience and cooperation as we assist you.

**Reference (start):** I appreciate you reaching out to notify us of the error you encountered with online payments. Error notifications play a crucial role in identifying and rectifying any issues promptly. To help us better understand the situation, could you please provide more details about the specific error you expe…

**Grade:** 4. Like the reference, the reply asks for details about the payment error (using the {{Order Number}} placeholder), but it also tells the customer to contact support by phone, email or live chat even though they are already talking to support, so it is slightly less focused than the reference.

**You agree:** ~~yes~~ / no

### 10. bitext-17771, openai/gpt-6-luna

**Customer:** assistance to cancel the newsletter subscription

**Answer:** I’m happy to help you cancel your newsletter subscription. Please provide the email address associated with the subscription so I can locate it and assist with the cancellation. We’ll handle your information with care.

**Reference (start):** I'm conscious of the reality that you would like assistance in canceling your newsletter subscription. I apologize for any inconvenience this may have caused. To proceed with canceling your subscription, could you please provide me with your email address or any other relevant information? This will…

**Grade:** 5. Like the reference, the reply agrees to help and asks for the email address linked to the subscription so it can be found and cancelled, and it adds no invented fees, deadlines or policies.

**You agree:** yes / ~~no~~

