
i have an idea of a neat bible search in obsidian

my case: i attend church services and i took a habit of taking notes when the preacher is saying something worthy to remember or quotes the Scripture. And i type it in my daily notes in Obsidian
And since often the scripture is quoted, i need to switch to MyBible app, open the place or find it via search, copy, switch to Obsidian, paste. And i find it a bit bothersome cuz it takes time. I want a sort of an inline search directly in an obsidian note. I trigger the plugin, it gives me a search bar, i type in address or key words, and it provides me options to scroll and choose from. and when i tap on the one i like, it gets pasted into the note. And also since i'm bilingual, i want ability to choose between two bible translations, russian and english (RST and KJV) - so, for example when i type in russian search words, it should show me the found verses in russian, and a parallel verse in kjv. also, when i type in english, i want to see the verse in english and alongside the corresponding verse in russian. And also i guess it would be useful to be able to insert scripture snippets based on a direct address (when i type in Gen 1 1, i want to see Genesis chapter 1 verse 1 and also Бытие 1:1) (it can be detected when numbers are typed, since there is no need to type in numbers)

bible verses have some tags like <S> and <i> and i think i need a function to get rid of them when showing and pasting

i am providing RST and KJV sqlite3 files for use

How does the user invoke it? - Command Palette (it can be connected to a hotkey later).

Search behavior
john 3:16
jn 3 16
gen 1
rom 8
eccl 1:4-5

these should all work. (when no verse is specified, entire chapter is to be pasted)

Fuzzy book names would be cool

when multiple words are entered, for example "grace faith", it means search results should contain both of these words. i guess it's ok to do a prefix search 

when there are many results, pagination is required i guess. 

it's better to show entire verse and matching words should be highlighted

when on the pc, the user should be able to switch between and select options using a keyboard (up/down + enter)

a pasted verse should look like this: John 3:16 (KJV) — For God so loved the world...

OS support: Desktop AND Obsidian Mobile (Android/iOS)
