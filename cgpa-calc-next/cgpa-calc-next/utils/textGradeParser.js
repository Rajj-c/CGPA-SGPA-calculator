/**
 * Client-side fallback parser for pasted grade card text.
 * Used when offline or as a immediate fast fallback if AI API is unavailable.
 * Specifically optimized for KARE university portal copy-paste format.
 */
export function parsePastedGradeText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { studentName: '', semesters: [], totalCGPA: null };
    }

    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    let studentName = '';
    let totalCGPA = null;
    const semestersMap = new Map(); // semesterNum -> array of courses
    let currentSem = 1;

    // Default column maps
    let colMap = { sem: 0, code: 1, name: 2, credits: 3, grade: 5 };
    let hasHeaderMap = false;

    // Regex for student name search
    const nameMatch = rawText.match(/(?:Student\s*Name|Name\s*of\s*the\s*Student|Name)\s*[:|-]\s*([^\r\n]+)/i);
    if (nameMatch && nameMatch[1]) {
        studentName = nameMatch[1].trim();
    }

    const validGrades = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'U', 'AB', 'O', 'P', 'F', 'A+', 'B+', 'C+', 'D+', 'E+']);

    // First pass: look for CGPA / headers / structure
    lines.forEach((line, lineIdx) => {
        // Split by tabs, pipes, or 2+ spaces to preserve course names with single spaces
        const tokens = line.split(/[\t|]+| {2,}/).map(t => t.trim()).filter(Boolean);
        if (tokens.length === 0) return;

        // 1. Header mapping
        const isHeaderRow = tokens.some(t => t.match(/course\s*code|att\.code|year\s*of\s*passing/i));
        if (isHeaderRow) {
            tokens.forEach((token, idx) => {
                if (token.match(/semester/i)) colMap.sem = idx;
                else if (token.match(/course\s*code/i)) colMap.code = idx;
                else if (token.match(/course\s*name/i)) colMap.name = idx;
                else if (token.match(/credits/i)) colMap.credits = idx;
                else if (token.match(/grade/i)) colMap.grade = idx;
            });
            hasHeaderMap = true;
            return;
        }

        // 2. CGPA parsing from headers
        if (line.match(/CGPA\s+Earned\s+Credits/i) || line.match(/CGPA\tEarned/i)) {
            const nextLine = lines[lineIdx + 1];
            if (nextLine) {
                const valTokens = nextLine.split(/[\t|]+| {2,}/).map(t => t.trim()).filter(Boolean);
                const val = parseFloat(valTokens[0]);
                if (!isNaN(val) && val >= 0 && val <= 10) {
                    totalCGPA = val;
                }
            }
            return;
        }

        // 3. Fallback inline CGPA match
        if (totalCGPA === null) {
            const cgpaMatch = line.match(/(?:CGPA|Cumulative\s*GPA|Overall\s*CGPA)\s*[:|-]?\s*([0-9]{1,2}(?:\.[0-9]{1,3})?)/i);
            if (cgpaMatch && cgpaMatch[1]) {
                const val = parseFloat(cgpaMatch[1]);
                if (val >= 0 && val <= 10) {
                    totalCGPA = val;
                }
            }
        }
    });

    // Second pass: extract data rows
    lines.forEach((line) => {
        const tokens = line.split(/[\t|]+| {2,}/).map(t => t.trim()).filter(Boolean);
        if (tokens.length < 3) return;

        // Skip headers or stats rows
        if (tokens.some(t => t.match(/course\s*code|att\.code|year\s*of\s*passing|earned\s*credits|no\s*of\s*arrears/i))) {
            return;
        }

        let semNum = currentSem;
        let code = '';
        let name = '';
        let credits = null;
        let grade = '';

        if (hasHeaderMap) {
            const semVal = parseInt(tokens[colMap.sem], 10);
            if (!isNaN(semVal)) semNum = semVal;

            code = tokens[colMap.code];
            name = tokens[colMap.name];
            
            const credVal = parseFloat(tokens[colMap.credits]);
            if (!isNaN(credVal)) credits = credVal;

            grade = tokens[colMap.grade]?.toUpperCase();
        } else {
            // Positional heuristic fallbacks
            if (tokens.length === 8) {
                // Mapped to KARE SIS layout: [Sem, Code, Name, Credits, Att.Code, Grade, Cat, Year]
                const semVal = parseInt(tokens[0], 10);
                if (!isNaN(semVal)) semNum = semVal;
                code = tokens[1];
                name = tokens[2];
                credits = parseFloat(tokens[3]);
                grade = tokens[5]?.toUpperCase();
            } else {
                // General layout e.g. [Code, Name, Credits, Grade] or [Sem, Code, Name, Credits, Grade]
                const firstIsNum = !isNaN(parseInt(tokens[0], 10)) && tokens[0].length <= 2;
                const codeIdx = firstIsNum ? 1 : 0;
                const nameIdx = firstIsNum ? 2 : 1;
                
                // Scan tokens from end to find Grade and Credits
                // Usually Grade is the last token, Credits is second-to-last
                const lastToken = tokens[tokens.length - 1].toUpperCase();
                const secondLastToken = tokens[tokens.length - 2];

                if (validGrades.has(lastToken)) {
                    grade = lastToken;
                    const credVal = parseFloat(secondLastToken);
                    if (!isNaN(credVal)) {
                        credits = credVal;
                        code = tokens[codeIdx];
                        name = tokens.slice(nameIdx, tokens.length - 2).join(' ');
                    }
                }
            }
        }

        // Validate course code shape and grade
        if (code && code.match(/^[A-Z0-9_-]{4,15}$/i) && credits !== null && grade && validGrades.has(grade)) {
            if (!semestersMap.has(semNum)) {
                semestersMap.set(semNum, []);
            }
            semestersMap.get(semNum).push({
                code: code,
                name: name || code,
                credits: credits,
                grade: normalizeGrade(grade)
            });
            // Update current semester track
            currentSem = semNum;
        }
    });

    // Convert map to semesters array
    const semesters = [];
    const sortedSemNums = Array.from(semestersMap.keys()).sort((a, b) => a - b);
    
    sortedSemNums.forEach(semNum => {
        semesters.push({
            semester: semNum,
            courses: semestersMap.get(semNum)
        });
    });

    return {
        studentName,
        semesters,
        totalCGPA
    };
}

function normalizeGrade(g) {
    const map = {
        'O': 'S',
        'A+': 'S',
        'B+': 'A',
        'C+': 'B',
        'PASS': 'C',
        'FAIL': 'U',
        'F': 'U'
    };
    return map[g] || g;
}
