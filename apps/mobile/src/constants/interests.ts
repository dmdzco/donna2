export const INTERESTS = [
  { id: "sports", label: "Sports", icon: "Dumbbell", question: "Which teams or sports do they follow?", placeholder: "e.g., Dallas Cowboys, tennis, golf..." },
  { id: "history", label: "History", icon: "Landmark", question: "What historical topics interest them?", placeholder: "e.g., WWII, American history..." },
  { id: "music", label: "Music", icon: "Music", question: "What kind of music do they enjoy?", placeholder: "e.g., jazz, Frank Sinatra, classical..." },
  { id: "film", label: "Film & TV", icon: "Film", question: "What shows or movies do they love?", placeholder: "e.g., classic westerns, Jeopardy..." },
  { id: "politics", label: "Politics", icon: "Vote", question: "What political topics interest them?", placeholder: "e.g., local news, elections..." },
  { id: "poetry", label: "Poetry", icon: "Feather", question: "Do they have favorite poets or poems?", placeholder: "e.g., Robert Frost, Maya Angelou..." },
  { id: "geography", label: "Geography", icon: "Globe", question: "What places fascinate them?", placeholder: "e.g., traveled to Italy, loves maps..." },
  { id: "animals", label: "Animals", icon: "PawPrint", question: "Do they have or love any animals?", placeholder: "e.g., has a cat named Mittens..." },
  { id: "literature", label: "Literature", icon: "BookOpen", question: "What do they like to read?", placeholder: "e.g., mystery novels, biographies..." },
  { id: "gardening", label: "Gardening", icon: "Flower2", question: "What do they grow or tend?", placeholder: "e.g., roses, vegetable garden..." },
  { id: "travel", label: "Travel", icon: "Plane", question: "Where have they traveled or want to go?", placeholder: "e.g., visited Paris, wants to see Grand Canyon..." },
  { id: "cooking", label: "Cooking", icon: "ChefHat", question: "What do they like to cook or eat?", placeholder: "e.g., Italian food, baking cookies..." },
] as const;

export type InterestId = typeof INTERESTS[number]["id"];
