import subprocess

if __name__ == "__main__":
    print("Welcome to RoboSpeaker")
    while True:

        x = input("What do you wanna say? ")
        if x == "quit":
            break
        command = f'''
        $voice = New-Object -ComObject SAPI.SpVoice
        $voice.Speak("{x}")
        '''

        subprocess.run(["powershell", "-Command", command])

