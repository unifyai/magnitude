#!/usr/bin/env python3
import json
import sys


def main():
    # Read patches
    with open('patches.json', 'r') as f:
        patches = json.load(f)
    
    # Read possible tasks and apply patches
    patched_count = 0
    with open('possibleTasks.jsonl', 'r') as input_file, \
         open('patchedTasks.jsonl', 'w') as output_file:
        
        for line in input_file:
            task = json.loads(line.strip())
            task_id = task['id']
            
            # Check if this task has a patch
            if task_id in patches:
                patch = patches[task_id]
                # Verify the original task matches
                if task['ques'] == patch['prev']:
                    task['ques'] = patch['new']
                    patched_count += 1
                else:
                    print(f"Warning: Task {task_id} doesn't match expected text", file=sys.stderr)
                    print(f"  Expected: {patch['prev']}", file=sys.stderr)
                    print(f"  Found: {task['ques']}", file=sys.stderr)
            
            # Write the task (patched or original)
            output_file.write(json.dumps(task) + '\n')
    
    print(f"Applied {patched_count} patches out of {len(patches)} available patches")


if __name__ == '__main__':
    main()