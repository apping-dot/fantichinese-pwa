import Papa from 'papaparse';  // Library to parse CSV data
import { supabase } from '../services/supabase';  // Import supabase client from supabase.js

// Function to generate lesson_slug automatically from the title
function generateLessonSlug(title) {
  return title.toLowerCase().replace(/\s+/g, '-');  // Converts title to lowercase and replaces spaces with hyphens
}

// Function to upload lessons from CSV data (you’ll feed the CSV data here)
async function uploadLessonsFromCSV(csvData) {
  // Parse the CSV data using PapaParse
  const parsedData = Papa.parse(csvData, {
    header: true,  // Treat the first row as headers (column names)
    skipEmptyLines: true,  // Skip empty lines
  });

  // Prepare the data for upsert by adding lesson_slug to each row
  const lessonsWithSlugs = parsedData.data.map((lesson) => ({
    ...lesson,
    lesson_slug: generateLessonSlug(lesson.title),  // Automatically create lesson_slug
    published: lesson.published === 'true',  // Convert "true"/"false" to boolean
  }));

  // Now perform the upsert operation on Supabase
  const { data, error } = await supabase
    .from('lessons')
    .upsert(lessonsWithSlugs, { onConflict: ['lesson_slug'] });  // Upsert based on lesson_slug

  if (error) {
    console.error('Error upserting lessons:', error);
  } else {
    console.log('Successfully upserted lessons:', data);
  }
}

export { uploadLessonsFromCSV };  // Export the function to use it elsewhere in your app
