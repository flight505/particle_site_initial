import os
import sys


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print("Usage: python combine_files.py output_file input_file1 input_file2 ...")
        return

    output_filename = args[0]
    input_filenames = args[1:]

    output_data = ""

    for fname in input_filenames:
        try:
            file_path = os.path.join(os.getcwd(), fname)
            with open(file_path, "r", encoding="utf-8") as f:
                data = f.read()
                output_data += f"\n===== Filename: {fname} =====\n\n"
                output_data += data
                output_data += "\n\n"
        except Exception as e:
            print(f"Error reading {fname}: {e}")

    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(output_data)
        print(f"Combined content written to {output_filename}")


if __name__ == "__main__":
    main()
