#!/usr/bin/env python3
import json

def filter_possible_tasks(original_file, impossible_file, output_file):
    # Load impossible task IDs
    with open(impossible_file, 'r') as f:
        impossible_ids = set(json.load(f))
    
    print(f"Loaded {len(impossible_ids)} impossible task IDs")
    
    # Process original tasks and filter out impossible ones
    possible_count = 0
    total_count = 0
    
    with open(original_file, 'r') as infile, open(output_file, 'w') as outfile:
        for line in infile:
            total_count += 1
            task = json.loads(line.strip())
            
            # Check if this task ID is in the impossible list
            if task['id'] not in impossible_ids:
                json.dump(task, outfile)
                outfile.write('\n')
                possible_count += 1
    
    print(f"Processed {total_count} total tasks")
    print(f"Filtered out {len(impossible_ids)} impossible tasks")
    print(f"Wrote {possible_count} possible tasks to {output_file}")
    
    return possible_count, total_count

if __name__ == "__main__":
    original_file = "originalTasks.jsonl"
    impossible_file = "impossibleTasks.json"
    output_file = "possibleTasks.jsonl"
    
    possible, total = filter_possible_tasks(original_file, impossible_file, output_file)